local lsp = require('lsp-zero').preset({})

lsp.on_attach(function(client, bufnr)
	lsp.default_keymaps({ buffer = bufnr })
end)

-- (Optional) Configure lua language server for neovim
require('lspconfig').lua_ls.setup(lsp.nvim_lua_ls())

lsp.setup()

local cmp = require('cmp')
local cmp_action = require('lsp-zero').cmp_action()

cmp.setup({
	mapping = {
		-- Confirm with enter
		['<CR>'] = cmp.mapping.confirm({ select = false }),

		-- Triggern completion menu
		['<C-Space>'] = cmp.mapping.complete(),
	}
})
