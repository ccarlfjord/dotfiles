local autocmd = vim.api.nvim_create_autocmd

autocmd('BufEnter', {
	command = 'lcd %:p:h'
})
autocmd('BufLeave', {
	pattern='netrw',
	command = 'lcd %:p:h'
})
autocmd('WinEnter', {
	pattern='netrw',
	command = 'lcd %:p:h'
})
