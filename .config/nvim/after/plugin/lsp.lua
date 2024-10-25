-- Mason
require("mason").setup()
require("mason-lspconfig").setup()


-- set up handlers for mason-lspconfig
require('mason-lspconfig').setup_handlers {
    function(server_name)
        require('lspconfig')[server_name].setup({})
    end,
    ["gopls"] = function()
        local lspconfig = require('lspconfig')
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
    end,
    ["lua_ls"] = function()
        local lspconfig = require('lspconfig')
        local lsp_zero = require('lsp-zero')
        lspconfig.lua_ls.setup(
            lsp_zero.nvim_lua_ls()
        )
    end,
    ["terraformls"] = function()
        local lspconfig = require('lspconfig')
        lspconfig.terraformls.setup({
            settings = {
                timeout = '30s'
            }
        })
    end,
    ["jsonls"] = function()
        local lspconfig = require('lspconfig')
        lspconfig.jsonls.setup {
            settings = {
                json = {
                    schemas = require('schemastore').json.schemas(),
                    validate = { enable = true },
                },
            },
        }
    end
}

--- Reserve a space in the gutter
-- This will avoid an annoying layout shift in the screen
vim.opt.signcolumn = 'yes'

-- don't add this function in the `on_attach` callback.
-- `format_on_save` should run only once, before the language servers are active.
local lsp_zero = require('lsp-zero')
lsp_zero.format_on_save({
    format_opts = {
        async = false,
        timeout_ms = 10000,
    },
    servers = {
        ['gopls'] = { 'go' },
        ['terraformls'] = { 'terraform' },
    }
})

-- Add cmp_nvim_lsp capabilities settings to lspconfig
-- This should be executed before you configure any language server
local lspconfig_defaults = require('lspconfig').util.default_config
lspconfig_defaults.capabilities = vim.tbl_deep_extend(
    'force',
    lspconfig_defaults.capabilities,
    require('cmp_nvim_lsp').default_capabilities()
)

-- This is where you enable features that only work
-- if there is a language server active in the file
vim.api.nvim_create_autocmd('LspAttach', {
    desc = 'LSP actions',
    callback = function(event)
        lsp_zero.default_keymaps({ buffer = event.buf })
    end,
})

-- nvim-cmp
local cmp = require('cmp')
local cmp_action = require('lsp-zero').cmp_action()

cmp.setup({
    preselect = 'item',
    completion = {
        completeopt = 'menu,menuone,noinsert',
    },
    sources = {
        { name = 'nvim_lsp' },
        { name = 'buffer' },
    },

    mapping = cmp.mapping.preset.insert({
        -- Confirm with enter
        ['<CR>'] = cmp.mapping.confirm({ select = false }),

        -- Trigger autocomplete
        ['<C-Space>'] = cmp.mapping.complete(),
        ['<C-e>'] = cmp.mapping.close(),

        -- Use tab for completion
        ['<Tab>'] = cmp_action.tab_complete(),
        ['<S-Tab>'] = cmp_action.select_prev_or_fallback(),
    })
})
