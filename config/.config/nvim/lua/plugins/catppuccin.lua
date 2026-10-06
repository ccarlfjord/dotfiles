return {
	{
		"catppuccin/nvim",
		name = "catppuccin",
		priority = 1000,
		init = function()
			vim.cmd.colorscheme "catppuccin-nvim"
		end,
		opts = {
			flavour = "auto",
			background = {
				light = "latte",
				dark = "frappe",
			},

		}

	}
}
-- require("catppuccin").setup({
-- 	-- flavour = "frappe"
-- 	flavour = "auto",
-- 	background = {
-- 		light = "latte",
-- 		dark = "frappe",
-- 	},
--
-- })
-- vim.cmd.colorscheme "catppuccin"
