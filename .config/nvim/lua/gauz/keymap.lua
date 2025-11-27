vim.g.mapleader = ' '
vim.keymap.set('v', '<', '<gv')
vim.keymap.set('v', '>', '>gv')
vim.keymap.set('n', '<Space>', '<Nop>', { silent = true, remap = false })
vim.keymap.set('n', '<C-Space>', '<Nop>', { silent = true, remap = false })
vim.keymap.set("i", "<C-c>", "<Esc>")
vim.keymap.set("n", "<leader>s", function()
	vim.lsp.buf.format()
	vim.lsp.buf.code_action({ context = { only = { "source.organizeImports" } }, apply = true })
	require('lint').try_lint()
end, { silent = true })
vim.keymap.set({ 'n', 'v' }, "<leader>i", '<C-I>')
vim.keymap.set({ 'n', 'v' }, "<leader>o", '<C-O>')
vim.keymap.set({ "n", "v" }, "<leader>y", [["+y]])
vim.keymap.set("n", "<leader>Y", [["+Y]])
vim.keymap.set("n", "<leader>fE", ":Telescope file_browser<CR>", { silent = true })
vim.keymap.set("n", "<leader>fe", ":Telescope file_browser path=%:p:h select_buffer=true<CR>", { silent = true })
vim.keymap.set("n", "<A-j>", ":m .+1<CR>==")     -- move line up(n)
vim.keymap.set("n", "<A-k>", ":m .-2<CR>==")     -- move line down(n)
vim.keymap.set("v", "<A-j>", ":m '>+1<CR>gv=gv") -- move line up(v)
vim.keymap.set("v", "<A-k>", ":m '<-2<CR>gv=gv") -- move line down(v)
vim.keymap.set("n", "<leader>d", ':lua vim.diagnostic.open_float()<CR>', { remap = false, silent = true })
vim.keymap.set({ "n", "v" }, "<leader>ca", ':lua vim.lsp.buf.code_action()<CR>', { remap = false, silent = true })
vim.keymap.set("n", "<leader>i", ':lua vim.lsp.buf.implementations()<CR>', { remap = false, silent = true })
vim.keymap.set("n", "<leader>j", ':lua vim.diagnostic.goto_next()<CR>')
vim.keymap.set("n", "<leader>k", ':lua vim.diagnostic.goto_prev()<CR>')

-- Don't yank on change/delete/paste
vim.keymap.set({ "n", "v" }, "d", '"_d')
vim.keymap.set({ "n", "v" }, "D", '"_D')
vim.keymap.set("n", "c", '"_c')
vim.keymap.set("n", "C", '"_C')
vim.keymap.set({ "v" }, "p", '"_dP')

-- lsp-zero keymaps
-- https://lsp-zero.netlify.app/docs/template/opinionated.html
vim.api.nvim_create_autocmd('LspAttach', {
	callback = function(event)
		local opts = { buffer = event.buf }

		vim.keymap.set('n', 'K', '<cmd>lua vim.lsp.buf.hover()<cr>', opts)
		vim.keymap.set('n', 'gd', '<cmd>lua vim.lsp.buf.definition()<cr>', opts)
		vim.keymap.set('n', 'gD', '<cmd>lua vim.lsp.buf.declaration()<cr>', opts)
		vim.keymap.set('n', 'gi', '<cmd>lua vim.lsp.buf.implementation()<cr>', opts)
		vim.keymap.set('n', 'go', '<cmd>lua vim.lsp.buf.type_definition()<cr>', opts)
		vim.keymap.set('n', 'gr', '<cmd>lua vim.lsp.buf.references()<cr>', opts)
		vim.keymap.set('n', 'gs', '<cmd>lua vim.lsp.buf.signature_help()<cr>', opts)
		vim.keymap.set('n', '<F2>', '<cmd>lua vim.lsp.buf.rename()<cr>', opts)
		vim.keymap.set({ 'n', 'x' }, '<F3>', '<cmd>lua vim.lsp.buf.format({async = true})<cr>', opts)
		vim.keymap.set('n', '<F4>', '<cmd>lua vim.lsp.buf.code_action()<cr>', opts)
	end,
})
