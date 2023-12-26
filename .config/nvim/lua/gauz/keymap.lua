vim.g.mapleader = ' '
vim.keymap.set('v', '<', '<gv')
vim.keymap.set('v', '>', '>gv')
vim.keymap.set('n', '<Space>', '<Nop>', {silent = true, remap = false })
vim.keymap.set('n', '<C-Space>', '<Nop>', {silent = true, remap = false })
vim.keymap.set("i", "<C-c>", "<Esc>")
vim.keymap.set("n", "Q", "<nop>")
vim.keymap.set("n", "<leader>s", vim.lsp.buf.format)
vim.keymap.set({'n', 'v'}, "<leader>i", '<C-I>')
vim.keymap.set({'n', 'v'}, "<leader>o", '<C-O>')
vim.keymap.set({"n", "v"}, "<leader>y", [["+y]])
vim.keymap.set("n", "<leader>Y", [["+Y]])
vim.keymap.set("n", "<leader>fe", ":Explore<CR>")
vim.keymap.set("n", "<leader>fE", ":Explore .<CR>")
vim.keymap.set("n", "<A-j>", ":m .+1<CR>==") -- move line up(n)
vim.keymap.set("n", "<A-k>", ":m .-2<CR>==") -- move line down(n)
vim.keymap.set("v", "<A-j>", ":m '>+1<CR>gv=gv") -- move line up(v)
vim.keymap.set("v", "<A-k>", ":m '<-2<CR>gv=gv") -- move line down(v)
vim.keymap.set("n", "<leader>d", ':lua vim.diagnostic.open_float()<CR>', { remap=false, silent=true})
vim.keymap.set("n", "<leader>ca", ':lua vim.lsp.buf.code_action()<CR>', { remap=false, silent=true})
vim.keymap.set("n", "<C-p>", "<cmd>!tmux neww tms<CR>", {silent=true, remap=false})
