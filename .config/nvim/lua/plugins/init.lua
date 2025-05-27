return {
	"tomtom/tcomment_vim",
	{
		"nvim-treesitter/nvim-treesitter",
		branch = "master",
		lazy = false,
		build = ":TSUpdate",
		config = function()
			require 'nvim-treesitter.configs'.setup {
				-- A list of parser names, or "all" (the five listed parsers should always be installed)
				ensure_installed = { "c", "lua", "vim", "vimdoc", "query", "go", "rust" },

				-- Install parsers synchronously (only applied to `ensure_installed`)
				sync_install = false,

				-- Automatically install missing parsers when entering buffer
				-- Recommendation: set to false if you don't have `tree-sitter` CLI installed locally
				auto_install = true,

				-- List of parsers to ignore installing (for "all")
				ignore_install = {},

				---- If you need to change the installation directory of the parsers (see -> Advanced Setup)
				-- parser_install_dir = "/some/path/to/store/parsers", -- Remember to run vim.opt.runtimepath:append("/some/path/to/store/parsers")!

				highlight = {
					enable = true,
				},
			}
		end,
	},
	"neovim/nvim-lspconfig",
	{
		"hrsh7th/nvim-cmp",
		config = function()
			local cmp = require('cmp')

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
					-- ['<Tab>'] = cmp_action.tab_complete(),
					-- ['<S-Tab>'] = cmp_action.select_prev_or_fallback(),
				})
			})
		end,
	},
	"hrsh7th/cmp-nvim-lsp",
	"L3MON4D3/LuaSnip",
	"hrsh7th/cmp-buffer",
	"saadparwaiz1/cmp_luasnip",
	"nvim-lua/plenary.nvim",
	"tpope/vim-fugitive",
	"tpope/vim-rhubarb",
	"chriskempson/base16-vim",
	"windwp/nvim-autopairs",
	{ "nvim-telescope/telescope-fzf-native.nvim", build = "make" },
	"nvim-telescope/telescope-file-browser.nvim",
	{ "tpope/vim-sleuth",                         tag = "v2.0" },
	"b0o/schemastore.nvim",
	"github/copilot.vim",
	"CopilotC-Nvim/CopilotChat.nvim",
	"towolf/vim-helm",
	"nvim-tree/nvim-web-devicons",
	{ "prichrd/netrw.nvim", opts = {} },
	{
		"mfussenegger/nvim-lint",
		config = function()
			require('lint').linters_by_ft = {
				ghaction = { 'actionlint' },
			}
		end
	},
}
