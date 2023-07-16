vim.g.mapleader = ' '
vim.keymap.set('v', '<', '<gv')
vim.keymap.set('v', '>', '>gv')
vim.keymap.set('n', '<Space>', '<Nop>', {silent = true, remap = false })
vim.keymap.set('n', '<C-Space>', '<Nop>', {silent = true, remap = false })
vim.keymap.set('n', '<leader>fe', vim.cmd.Ex)
vim.keymap.set("i", "<C-c>", "<Esc>")
vim.keymap.set("n", "Q", "<nop>")
vim.keymap.set("n", "<leader>s", vim.lsp.buf.format)
vim.keymap.set({'n', 'v'}, "<leader>i", '<C-I>')
vim.keymap.set({'n', 'v'}, "<leader>o", '<C-O>')
vim.keymap.set({"n", "v"}, "<leader>y", [["+y]])
vim.keymap.set("n", "<leader>Y", [["+Y]])

