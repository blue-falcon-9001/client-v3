<script>

	import { onMount } from 'svelte'

	import Modals from './components/layout/Modals.svelte'
	import Toasts from './components/layout/Toasts.svelte'
	import Header from './components/layout/Header.svelte'

	import { initWebsocket } from './lib/stream'
	import { component } from './lib/stores'
	import { loadRoute, navigateTo, catchLinks, hidePopoversOnClick } from './lib/utils'

	// localstorage clearance for v2
	if (localStorage.getItem('productId')*1 > 0) {
		localStorage.removeItem('productId');
		localStorage.removeItem('leverage');
		localStorage.removeItem('cachedLeverages');
	}

	onMount(async () => {
		loadRoute(location.hash, true);
		catchLinks((path) => navigateTo(path));
		hidePopoversOnClick();

		// For back button functionality
		window.onpopstate = () => loadRoute(location.hash);

		initWebsocket();
	});

</script>

<style>

	/*Global styles*/

	/*Only keep color vars here, rest can go to global.css reset stylesheet*/

	:global(:root) {

		--red: #FF5000;
		--red-dim: #E04700;
		--red-dark: #421500;
		--green: #00C805;
		--green-dim: #00B803;
		--green-dark: #004201;

		--rich-black: #080808;
		--rich-black-fogra: #0F0F0F;
		--eerie-black: #1A1A1A;
		--jet-dim: #212121;
		--jet: #292929;
		--onyx-dim: #353535;
		--onyx: #3D3D3D;
		--dim-gray: #616161;
		--sonic-silver: #707070;
		--orange: rgb(253,167,20);
		
		--base-padding: 16px;
		--semi-padding: 16px;
		--base-radius: 4px;
		--container-width: 2100px;

		--chart-resolution-height: 40px;
		--chart-height: 400px;
		--header-height: 60px;
		--ticker-height: 60px;
		--grid-gap: 1px;

	}

	:global(.pos) {
		color: var(--green);
	}
	:global(.neg) {
		color: var(--red);
	}

</style>

<Modals />
<Toasts />

<Header />
<svelte:component this={$component}/>
