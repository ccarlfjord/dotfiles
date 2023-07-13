require('gauz.keymap')
vim.opt.tabstop = 4
vim.opt.shiftwidth = 4
vim.opt.backspace = "2"
vim.opt.nu = true
vim.opt.smartindent = true
vim.opt.wrap = false
vim.opt.updatetime = 50
vim.opt.hlsearch = false
vim.opt.incsearch = true
vim.opt.signcolumn = "yes"
vim.opt.colorcolumn = "80"
local has = vim.fn.has
if has('unnamedplus') then
	vim.opt.clipboard = 'unnamedplus'
else
	vim.opt.clipboard = 'unnamed'
end
