" Load plugins
call plug#begin()
Plug 'tomtom/tcomment_vim'
Plug 'nvim-treesitter/nvim-treesitter', {'do': ':TSUpdate'}
" LSP Support
Plug 'neovim/nvim-lspconfig'                           " Required
Plug 'williamboman/mason.nvim', {'do': ':MasonUpdate'} " Optional
Plug 'williamboman/mason-lspconfig.nvim'               " Optional

" Autocompletion
Plug 'hrsh7th/nvim-cmp'     " Required
Plug 'hrsh7th/cmp-nvim-lsp' " Required
Plug 'L3MON4D3/LuaSnip'     " Required

Plug 'VonHeikemen/lsp-zero.nvim', { 'branch': 'v2.x'}
Plug 'nvim-lua/plenary.nvim'
Plug 'nvim-telescope/telescope.nvim', { 'branch': '0.1.x' }

Plug 'tpope/vim-fugitive', { 'tag': 'v3.7' }
Plug 'tpope/vim-rhubarb'
Plug 'chriskempson/base16-vim'
Plug 'windwp/nvim-autopairs'
Plug 'nvim-telescope/telescope-fzf-native.nvim', { 'do': 'make' }
Plug 'nvim-telescope/telescope-file-browser.nvim'
Plug 'tpope/vim-sleuth', { 'tag': '*' }
call plug#end()

source ~/.config/nvim/lua/gauz/init.lua

" Custom config
syntax on
filetype plugin on

let g:go_fmt_command = "goimports"

" Highlight rogue whitespaces
highlight WhitespaceEOL ctermbg=red guibg=red
match WhitespaceEOL /\s\+$/

" Highlight rogue tabs
highlight TabEOL ctermbg=red guibg=red
match TabEOL /\t\+$/

"Buffer keymaps
" map <silent> <F3> :bp<CR>
" map <silent> <F2> :bn<CR>

