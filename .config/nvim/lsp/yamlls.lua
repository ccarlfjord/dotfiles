return {
	settings = {
		yaml = {
			schemas = require('schemastore').yaml.schemas(),
			validate = true,
			format = {
				enable = true,
			},
			schemaStore = {
				enable = true,
			},
		},
	},
}
