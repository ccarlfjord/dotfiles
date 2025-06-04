local setupTelescope = function()

end
return {
	"ANGkeith/telescope-terraform-doc.nvim",
	'nvim-lua/plenary.nvim',
	"nvim-telescope/telescope-file-browser.nvim",
	{
		'nvim-telescope/telescope-fzf-native.nvim',
		build = 'cmake -S. -Bbuild -DCMAKE_BUILD_TYPE=Release && cmake --build build --config Release'
	},
	{
		'nvim-telescope/telescope.nvim',
		tag = '0.1.8',
		init = function()
		end,
		opts = function()
			local builtin = require('telescope.builtin')
			vim.keymap.set('n', '<leader>ff', builtin.find_files, {})
			vim.keymap.set('n', '<leader>fg', builtin.live_grep, {})
			vim.keymap.set('n', '<leader>fb', builtin.buffers, {})
			vim.keymap.set('n', '<leader>fh', builtin.help_tags, {})
			vim.keymap.set('n', '<leader>fd', '<cmd>Telescope diagnostics<CR>', {})
			vim.keymap.set('n', '<leader>fs', builtin.lsp_dynamic_workspace_symbols, {})

			require('telescope').load_extension('file_browser')
			require('telescope').load_extension('terraform_doc')

			local telescopeConfig = require("telescope.config")
			local vimgrep_arguments = { unpack(telescopeConfig.values.vimgrep_arguments) }
			-- Find in dotfiles
			table.insert(vimgrep_arguments, "--hidden")
			-- I don't want to search in the `.git` directory.
			table.insert(vimgrep_arguments, "--glob")
			table.insert(vimgrep_arguments, "!**/.git/*")

			local telescope = require('telescope')

			return {
				defaults = {
					vimgrep_arguments = vimgrep_arguments,
					file_ignore_patterns = {
						"vendor",
					}

				},
				pickers = {
					find_files = {
						find_command = { "rg", "--files", "--hidden", "--glob", "!**/.git/*" },
					},
				},
				extensions = {
					file_browser = {
						hijack_netrw = false,
						hidden = true,
					},
				},
			}
		end
	},
}


-- local builtin = require('telescope.builtin')
-- -- vim.keymap.set('n', '<leader>fe', '<cmd>Telescope file_browser<CR>', {})
-- vim.keymap.set('n', '<leader>ff', builtin.find_files, {})
-- vim.keymap.set('n', '<leader>fg', builtin.live_grep, {})
-- vim.keymap.set('n', '<leader>fb', builtin.buffers, {})
-- vim.keymap.set('n', '<leader>fh', builtin.help_tags, {})
-- vim.keymap.set('n', '<leader>fd', '<cmd>Telescope diagnostics<CR>', {})
-- vim.keymap.set('n', '<leader>fs', builtin.lsp_dynamic_workspace_symbols, {})
--
-- local telescopeConfig = require("telescope.config")
-- local vimgrep_arguments = { unpack(telescopeConfig.values.vimgrep_arguments) }
-- -- Find in dotfiles
-- table.insert(vimgrep_arguments, "--hidden")
-- -- I don't want to search in the `.git` directory.
-- table.insert(vimgrep_arguments, "--glob")
-- table.insert(vimgrep_arguments, "!**/.git/*")
--
-- local telescope = require('telescope')
--
-- telescope.setup({
-- 	defaults = {
-- 		vimgrep_arguments = vimgrep_arguments,
-- 		file_ignore_patterns = {
-- 			"vendor",
-- 		}
--
-- 	},
-- 	pickers = {
-- 		find_files = {
-- 			find_command = { "rg", "--files", "--hidden", "--glob", "!**/.git/*" },
-- 		},
-- 	},
-- 	extensions = {
-- 		file_browser = {
-- 			hijack_netrw = false,
-- 			hidden = true,
-- 		},
-- 	},
-- })
-- require("telescope").load_extension "file_browser"
