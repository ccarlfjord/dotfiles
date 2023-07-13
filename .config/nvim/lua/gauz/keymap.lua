vim.g.mapleader = ' '
vim.keymap.set('v', '<', '<gv')
vim.keymap.set('v', '>', '>gv')
vim.keymap.set('n', '<Space>', '<Nop>', {silent = true, remap = false })
-- Copy to clipboard
vim.keymap.set('v', '<leader>y', '+y')
vim.keymap.set('n', '<leader>Y', '+yg_')
vim.keymap.set('n', '<leader>y', '+y')
vim.keymap.set('n', '<leader>yy', '+yy')

-- Paste from clipboard
vim.keymap.set('n', '<leader>p', '+p')
vim.keymap.set('n', '<leader>P', '+P')
vim.keymap.set('v', '<leader>p', '+p')
vim.keymap.set('v', '<leader>P', '+P')
