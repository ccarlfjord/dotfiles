return {
	{
		"ellisonleao/glow.nvim",
		event = "VeryLazy",
		cmd = { "Glow", "GlowInstall" },
		build = ":GlowInstall",
		opts = {
			width = 120,
			width_ratio = 0.9,
			height_ratio = 0.9,
		}
	}
}
