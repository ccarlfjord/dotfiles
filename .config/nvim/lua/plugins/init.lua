return {
	"tomtom/tcomment_vim",
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
					{ name = 'copilot' },
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
	{ "windwp/nvim-autopairs", event = "InsertEnter", config = true },
	{ "tpope/vim-sleuth",      tag = "v2.0" },
	"b0o/schemastore.nvim",
	"nvim-tree/nvim-web-devicons",
	"prichrd/netrw.nvim",
	{
		"mfussenegger/nvim-lint",
		config = function()
			require('lint').linters_by_ft = {
				ghaction = { 'actionlint' },
			}
		end
	},
	{
		"folke/todo-comments.nvim",
		dependencies = { "nvim-lua/plenary.nvim" },
		opts = {
			-- your configuration comes here
			-- or leave it empty to use the default settings
			-- refer to the configuration section below
		}
	},
	{
		"qvalentin/helm-ls.nvim",
		ft = "helm",
	},
	{
		"zbirenbaum/copilot.lua",
		enabled = false,
		cmd = "Copilot",
		event = "BufReadPost",
		opts = {
			suggestion = {
				-- enabled = not vim.g.ai_cmp,
				enabled = false,
				auto_trigger = true,
				hide_during_completion = vim.g.ai_cmp,
				keymap = {
					accept = false, -- handled by nvim-cmp / blink.cmp
					next = "<M-]>",
					prev = "<M-[>",
				},
			},
			panel = { enabled = false },
			filetypes = {
				markdown = true,
				help = true,
			},
		},
		-- copilot_model = "claude-sonnet-4-5"
		-- copilot_model = "claude-opus-4-5"
	},
	{
		"zbirenbaum/copilot-cmp",
		config = function()
			require("copilot_cmp").setup()
		end
	},
}
