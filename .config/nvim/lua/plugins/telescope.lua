local setupTelescope = function()

end
return {
	{
		'nvim-telescope/telescope.nvim',
		branch = 'master',
		dependencies = {
			'nvim-lua/plenary.nvim',
			'ANGkeith/telescope-terraform-doc.nvim',
			'nvim-telescope/telescope-file-browser.nvim',
			{
				'nvim-telescope/telescope-fzf-native.nvim',
				build = 'cmake -S. -Bbuild -DCMAKE_BUILD_TYPE=Release && cmake --build build --config Release',
			},
		},
		keys = {
			{ '<leader>ff', '<cmd>Telescope find_files<cr>',                    desc = 'Find files' },
			{ '<leader>fg', '<cmd>Telescope live_grep<cr>',                     desc = 'Live grep' },
			{ '<leader>fb', '<cmd>Telescope buffers<cr>',                       desc = 'Buffers' },
			{ '<leader>fh', '<cmd>Telescope help_tags<cr>',                     desc = 'Help tags' },
			{ '<leader>fd', '<cmd>Telescope diagnostics<cr>',                   desc = 'Diagnostics' },
			{ '<leader>fs', '<cmd>Telescope lsp_dynamic_workspace_symbols<cr>', desc = 'LSP dynamic workspace symbols' },
		},
		opts = {
			defaults = {
				vimgrep_arguments = {
					'rg',
					'--color=never',
					'--no-heading',
					'--with-filename',
					'--line-number',
					'--column',
					'--smart-case',
					'--hidden',
					'--glob',
					'!**/.git/*',
				},
				file_ignore_patterns = {
					'vendor',
				},
			},
			pickers = {
				find_files = {
					find_command = { 'rg', '--files', '--hidden', '--glob', '!**/.git/*' },
				},
			},
			extensions = {
				file_browser = {
					hijack_netrw = false,
					hidden = true,
				},
			},
		},
		config = function(_, opts)
			local telescope = require('telescope')
			telescope.setup(opts)

			-- Load extensions safely after setup
			telescope.load_extension('file_browser')
			telescope.load_extension('terraform_doc')
			pcall(telescope.load_extension, 'fzf')
		end,
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
