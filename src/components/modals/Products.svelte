<script>
	
	import Modal from './Modal.svelte'

	import { productId } from '../../lib/stores'

	import { selectProduct } from '../../lib/methods'

	import { hideModal } from '../../lib/utils'
	import { PRODUCT_LOGOS } from '../../lib/constants'
	
</script>

<style>

	.row {
		display: flex;
		align-items: center;
		padding: 0 var(--base-padding);
		border-bottom: 1px solid var(--jet-dim);
		font-size: 120%;
		font-weight: 700;
		cursor: pointer;
		height: 74px;
	}
	.row:not(.selected):hover {
		background-color: var(--jet-dim);
	}
	.row.selected {
		background-color: var(--jet);
		cursor: default !important;
	}
	.row:last-child {
		border-bottom: none;
	}

	.product-wrap {
		display: flex;
		align-items: center;
	}

	.product-wrap img {
		width: 32px;
		margin-right: 10px;
	}

</style>

<Modal>

	{#each Object.entries(PRODUCT_LOGOS) as [_productId, _logo]}

		<div class='row' class:selected={_productId == $productId} on:click={async () => {await selectProduct(_productId); hideModal()}} data-intercept="true">

			<div class='product-wrap'>
				<img src={_logo} alt={`${_productId} logo`}>
				<span>{_productId}</span>
			</div>

		</div>

	{/each}

</Modal>