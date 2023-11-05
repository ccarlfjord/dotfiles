local lsp = require('lsp-zero').preset({})

lsp.on_attach(function(client, bufnr)
	lsp.default_keymaps({ buffer = bufnr })
end)

-- (Optional) Configure lua language server for neovim
require('lspconfig').lua_ls.setup(lsp.nvim_lua_ls())
-- Setup gopls language server
require('lspconfig').gopls.setup({})
lsp.setup()

local cmp = require('cmp')
local cmp_action = require('lsp-zero').cmp_action()

cmp.setup({
	mapping = {
		-- Confirm with enter
		['<CR>'] = cmp.mapping.confirm({ select = false }),

		-- Trigger autocomplete
		['<C-Space>'] = cmp.mapping.complete(),
		-- Use tab for completion
		['<Tab>'] = cmp_action.tab_complete(),
		['<S-Tab>'] = cmp_action.select_prev_or_fallback(),
	}
})
