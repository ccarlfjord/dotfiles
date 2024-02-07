local autocmd = vim.api.nvim_create_autocmd
autocmd("BufWritePre", {
	pattern = "*.tf",
	command = "lua vim.lsp.buf.format()"
})
