// Contract interaction
import { get } from 'svelte/store'

import { monitorTx } from './monitor'

import { getContract } from './contracts'
import { loadCandles, loadPositionLines, applyWatermark } from './chart'
import { formatUnits, formatProduct, formatPositions, parseUnits, getChainData, hideModal, showToast, getCachedLeverage, toBytes32 } from './utils'

import * as Stores from './stores'

let productCache = {};

// TODO: errors and toasts

export async function getProduct(productId) {
	
	if (productCache[productId]) return productCache[productId];
	
	const contract = await getContract('trading');
	if (!contract) return {};

	productCache[productId] = formatProduct(productId, await contract.getProduct(toBytes32(productId)));
	
	return productCache[productId];

}

export async function selectProduct(productId) {
	
	if (!productId) productId = get(Stores.productId);

	let product = await getProduct(productId);

	if (!product.symbol) {
		product = {symbol: 'ETH-USD', productId: 1, maxLeverage: 50};
	}

	Stores.product.set(product);
	Stores.productId.set(productId);
	localStorage.setItem('productId', productId);

	// Leverage
	const cached = getCachedLeverage(productId);
	if (cached) {
		Stores.leverage.set(cached);
	} else {
		Stores.leverage.set(product.maxLeverage);
	}

	// Chart
	await loadCandles();
	applyWatermark();

}

export async function selectCurrency(currencyLabel) {
	
	if (!currencyLabel) currencyLabel = get(Stores.currencyLabel);

	const currencies = getChainData('currencies');
	if (!currencies) return;

	const currency = currencies[currencyLabel];

	Stores.currency.set(currency);
	Stores.currencyLabel.set(currencyLabel);
	localStorage.setItem('currencyLabel', currencyLabel);

	await getAllowance(currencyLabel, 'trading');

}

export async function getAllowance(currencyLabel, spenderName) {
	
	if (!currencyLabel) currencyLabel = get(Stores.currencyLabel);

	// console.log('currencyLabel', currencyLabel);

	if (currencyLabel == 'weth') {
		Stores.allowances.update((x) => {
			if (!x[currencyLabel]) x[currencyLabel] = {};
			x[currencyLabel][spenderName] = parseUnits(10**10, 18);
			return x;
		});
		return;
	}

	const address = get(Stores.address);
	if (!address) return;

	const contract = await getContract(currencyLabel);
	if (!contract) return;

	const spenderContract = await getContract(spenderName);
	if (!spenderContract) return;

	const allowance = formatUnits(await contract.allowance(address, spenderContract.address), 18);

	// console.log('allowance', allowance);

	Stores.allowances.update((x) => {
		if (!x[currencyLabel]) x[currencyLabel] = {};
		x[currencyLabel][spenderName] = allowance;
		return x;
	});

}

export async function getOrders(keys) {
	
	const contract = await getContract('trading');
	if (!contract) return {};
	
	return await contract.getOrders(keys);

}

export async function getPositions(keys) {
	
	const contract = await getContract('trading');
	if (!contract) return {};
	
	return await contract.getPositions(keys);

}

// ERC20

export async function approveCurrency(currencyLabel, spenderName) {
	
	const contract = await getContract(currencyLabel, true);
	if (!contract) return;

	const spenderContract = await getContract(spenderName);
	if (!spenderContract) return;

	const spenderAddress = spenderContract.address;

	try {
		const tx = await contract.approve(spenderAddress, parseUnits(10 * 10**9, 18));
		monitorTx(tx.hash, 'approve', {currencyLabel, spenderName});
	} catch(e) {
		showToast(e);
		return e;
	}

}

export async function getBalanceOf(currencyLabel, address) {
	
	if (!currencyLabel) currencyLabel = get(Stores.currencyLabel);
	
	if (!address) {
		address = get(Stores.address);
		if (!address) return 0;
	}

	let balance, decimals;
	if (currencyLabel == 'weth') {
		// get ETH balance
		balance = await get(Stores.provider).getBalance(address);
	} else {
		const contract = await getContract(currencyLabel);
		if (!contract) return 0;
		decimals = await contract.decimals();
		balance = await contract.balanceOf(address);
	}
	
	return formatUnits(balance, decimals || 18);

}

// Pool

export async function getPoolShare(currencyLabel) {

	const contract = await getContract('router');
	if (!contract) return 0;

	const currencies = getChainData('currencies');
	if (!currencies) return;

	const currency = currencies[currencyLabel];

	return formatUnits(await contract.getPoolShare(currency), 2);

}

export async function getCapPoolShare(currencyLabel) {

	const contract = await getContract('router');
	if (!contract) return 0;

	const currencies = getChainData('currencies');
	if (!currencies) return;

	const currency = currencies[currencyLabel];

	return formatUnits(await contract.getCapShare(currency), 2);

}

export async function getUserPoolBalance(currencyLabel) {
	
	const address = get(Stores.address);
	if (!address) return 0;

	const contract = await getContract('pool', false, currencyLabel);
	if (!contract) return 0;

	// TEST TEST
	//return 0;

	return formatUnits(await contract.getCurrencyBalance(address), 18);

}

export async function getPoolInfo(currencyLabel) {

	let info = {
		tvl: 0,
		userBalance: 0,
		claimableReward: 0,
		poolShare: 50,
		withdrawFee: 0.15,
		utilization: 0,
		openInterest: 0,
		utilizationMultiplier: 0.1
	};

	const contract = await getContract('pool', false, currencyLabel);

	Stores.pools.update((x) => {
		x[currencyLabel] = info;
		return x;
	});

	if (!contract) return;

	try {
		const poolBalance = await getBalanceOf(currencyLabel, contract.address);
		const userBalance = await getUserPoolBalance(currencyLabel);
		const claimableReward = await getClaimableReward(currencyLabel);
		const poolShare = await getPoolShare(currencyLabel);
		const withdrawFee = formatUnits(await contract.withdrawFee(), 2);
		const utilization = formatUnits(await contract.getUtilization(), 2);
		const openInterest = formatUnits(await contract.openInterest(), 18);
		const utilizationMultiplier = formatUnits(await contract.utilizationMultiplier(), 2);

		info = {
			tvl: poolBalance,
			userBalance,
			claimableReward,
			poolShare,
			withdrawFee,
			utilization,
			openInterest,
			utilizationMultiplier
		};

	} catch(e) {}

	Stores.pools.update((x) => {
		x[currencyLabel] = info;
		return x;
	});

}

export async function deposit(currencyLabel, amount) {
	
	const contract = await getContract('pool', true, currencyLabel);
	if (!contract) return;

	try {
		let tx;

		if (currencyLabel == 'weth') {
			tx = await contract.deposit(0, {value: parseUnits(amount, 18)});
		} else {
			tx = await contract.deposit(parseUnits(amount, 18));
		}

		monitorTx(tx.hash, 'pool-deposit', {currencyLabel});
		hideModal();
	} catch(e) {
		showToast(e);
		return e;
	}

}

export async function withdraw(currencyLabel, amount) {
	
	const contract = await getContract('pool', true, currencyLabel);
	if (!contract) return;

	try {
		let tx = await contract.withdraw(parseUnits(amount, 18));
		monitorTx(tx.hash, 'pool-withdraw', {currencyLabel});
		hideModal();
	} catch(e) {
		showToast(e);
		return e;
	}

}

export async function collectPoolReward(currencyLabel) {
	
	const contract = await getContract('poolrewards', true, currencyLabel);
	if (!contract) return;

	try {
		let tx = await contract.collectReward();
		monitorTx(tx.hash, 'pool-collect', {currencyLabel});
	} catch(e) {
		showToast(e);
		return e;
	}

}

// Cap Pool

export async function getUserCapBalance() {

	const address = get(Stores.address);
	if (!address) return;

	const contract = await getContract('capPool');
	if (!contract) return;

	return formatUnits(await contract.getBalance(address), 18);

}

export async function getCapSupply() {

	const contract = await getContract('capPool');
	if (!contract) return;
	
	return formatUnits(await contract.totalSupply(), 18);

}

export async function getCapPoolInfo() {
	
	let info = {
		supply: 0,
		userBalance: 0,
		claimableRewards: {},
		poolShares: {}
	};

	const currencies = getChainData('currencies');
	if (!currencies || !get(Stores.address)) {
		Stores.capPool.set(info);
		return;
	}

	let claimableRewards = {};
	let poolShares = {};
	for (const currencyLabel in currencies) {
		claimableRewards[currencyLabel] = await getClaimableReward(currencyLabel, true);
		poolShares[currencyLabel] = await getCapPoolShare(currencyLabel);
	}

	info = {
		supply: await getCapSupply(),
		userBalance: await getUserCapBalance(),
		claimableRewards,
		poolShares
	};

	Stores.capPool.set(info);

}

export async function depositCAP(amount) {
	
	const contract = await getContract('capPool', true);
	if (!contract) return;

	try {
		let tx = await contract.deposit(parseUnits(amount, 18));
		monitorTx(tx.hash, 'cap-deposit');
		hideModal();
	} catch(e) {
		showToast(e);
		return e;
	}

}

export async function withdrawCAP(amount) {
	
	const contract = await getContract('capPool', true);
	if (!contract) return;

	try {
		let tx = await contract.withdraw(parseUnits(amount, 18));
		monitorTx(tx.hash, 'cap-withdraw');
		hideModal();
	} catch(e) {
		showToast(e);
		return e;
	}

}

export async function collectCAPReward(currencyLabel) {
	
	const contract = await getContract('caprewards', true, currencyLabel);
	if (!contract) return;

	try {
		let tx = await contract.collectReward();
		monitorTx(tx.hash, 'cap-collect', {currencyLabel});
	} catch(e) {
		showToast(e);
		return e;
	}

}

// Rewards

export async function getClaimableReward(currencyLabel, forCAP) {
	
	const contractName = forCAP ? 'caprewards' : 'poolrewards';
	const contract = await getContract(contractName, true, currencyLabel);
	if (!contract) return;

	return formatUnits(await contract.getClaimableReward(), 18);

}

// Positions

// TODO: error handling

export async function submitOrder(isLong) {

	const contract = await getContract('trading', true);
	if (!contract) return;

	const currencyLabel = get(Stores.currencyLabel);
	const currency = get(Stores.currency);
	const productId = get(Stores.productId);
	const size = get(Stores.size);
	const leverage = get(Stores.leverage);

	if (!size || !leverage) return;

	let margin = size / leverage;

	try {

		let marginEth = 0;

		if (currencyLabel == 'weth') {
			// Add fee to margin
			const product = get(Stores.product);
			const fee = product.fee * 1;
			margin += size * fee / 100;
			marginEth = margin;
		}

		margin = margin.toFixed(8);

		// console.log('parseUnits(margin, 18)', parseUnits(margin, 18));

		// console.log('sm', size, margin, parseUnits(size));

		let tx = await contract.submitOrder(
			toBytes32(productId),
			currency,
			isLong,
			parseUnits(margin),
			parseUnits(size),
			{value: parseUnits(marginEth, 18)}
		);

		monitorTx(tx.hash, 'submit-new-position');

	} catch(e) {
		showToast(e);
		return e;
	}

}

export async function submitCloseOrder(productId, currencyLabel, isLong, size) {

	//console.log('sco', positionId, productId, size, currencyLabel);

	const contract = await getContract('trading', true);
	if (!contract) return;

	const currencies = getChainData('currencies');
	if (!currencies) return;

	const currency = currencies[currencyLabel];

	try {
		let tx;

		if (currencyLabel == 'weth') {

			const product = await getProduct(productId);
			const fee = (size * product.fee / 100).toFixed(10);

			// console.log('size', size);
			// console.log('fee', product.fee, fee);

			tx = await contract.submitCloseOrder(
				toBytes32(productId),
				currency,
				isLong,
				parseUnits(size),
				{value: parseUnits(fee, 18)}
			);

		} else {

			tx = await contract.submitCloseOrder(
				toBytes32(productId),
				currency,
				isLong,
				parseUnits(size)
			);

		}

		monitorTx(tx.hash, 'submit-close-order');
		hideModal();
		
	} catch(e) {
		showToast(e);
		return e;
	}

}

export async function cancelOrder(productId, currencyLabel, isLong) {

	const contract = await getContract('trading', true);
	if (!contract) return;

	const currencies = getChainData('currencies');
	if (!currencies) return;

	const currency = currencies[currencyLabel];

	try {

		const tx = await contract.cancelOrder(toBytes32(productId), currency, isLong);
		monitorTx(tx.hash, 'cancel-order');
		hideModal();

	} catch(e) {

		showToast(e);
		return e;

	}

}