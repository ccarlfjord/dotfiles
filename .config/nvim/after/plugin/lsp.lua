local lsp = require('lsp-zero').preset({})

lsp.on_attach(function(client, bufnr)
    lsp.default_keymaps({ buffer = bufnr })
end)

-- don't add this function in the `on_attach` callback.
-- `format_on_save` should run only once, before the language servers are active.
lsp.format_on_save({
    format_opts = {
        async = false,
        timeout_ms = 10000,
    },
    servers = {
        ['gopls'] = {'go'},
        ['terraformls'] = {'terraform'},
    }
})
local lspconfig = require('lspconfig')

-- (Optional) Configure lua language server for neovim
lspconfig.lua_ls.setup(lsp.nvim_lua_ls())
-- Setup gopls language server
lspconfig.gopls.setup({
    settings = {
        gopls = {
            analyses = {
                unusedparams = true,
            },
            staticcheck = true,
            gofumpt = true,
        },
    },
})

lspconfig.terraformls.setup({
    settings = {
        timeout = '30s'
    }
})

lspconfig.jsonls.setup {
    settings = {
        json = {
            schemas = require('schemastore').json.schemas(),
            validate = { enable = true },
        },
    },
}

-- lspconfig.yamlls.setup {
--   settings = {
--     yaml = {
--       schemaStore = {
--         -- You must disable built-in schemaStore support if you want to use
--         -- this plugin and its advanced options like `ignore`.
--         enable = false,
--         -- Avoid TypeError: Cannot read properties of undefined (reading 'length')
--         url = "",
--       },
--       schemas = require('schemastore').yaml.schemas(),
--     },
--   },
-- }

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
        -- ['<Tab>'] = cmp_action.tab_complete(),
        -- ['<S-Tab>'] = cmp_action.select_prev_or_fallback(),
    }
})
