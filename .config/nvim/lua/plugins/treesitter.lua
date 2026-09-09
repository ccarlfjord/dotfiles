return {
	{
		"nvim-treesitter/nvim-treesitter",
		branch = "main",
		lazy = false,
		build = ":TSUpdate",
		config = function()
			local parsers = { "c", "lua", "vim", "vimdoc", "query", "go", "rust" }
			local ts = require('nvim-treesitter')

			-- main-branch rewrite: the plugin only manages parsers/queries;
			-- highlighting is core Nvim and must be started per-buffer.
			ts.install(parsers)

			vim.api.nvim_create_autocmd('FileType', {
				callback = function(args)
					local lang = vim.treesitter.language.get_lang(args.match)
					-- only handle languages the plugin actually supports
					if not lang or not vim.list_contains(ts.get_available(), lang) then
						return
					end
					-- start fails if the parser is missing/not ready yet
					-- (install() is async); install is a no-op once present
					if not pcall(vim.treesitter.start, args.buf) then
						ts.install({ lang })
					end
				end,
			})
		end,
	},
}
