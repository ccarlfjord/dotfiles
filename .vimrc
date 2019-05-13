"set cursorline
"Remap < and > to <gv and >gv (Indent and stay highlighted)
vnoremap < <gv
vnoremap > >gv
syntax on
set hidden
set hlsearch
"let g:go_fmt_command = "goimports"
"let g:netrw_browse_split=4      " Open file in previous buffer
"let g:ale_linters = {'go': []}

" let g:ale_fixers = ['shfmt']
" let g:ale_completion_enabled = 1
" map <c-j>	:ALEGoToDefinition

"NERDtree like setup for netrw
" let g:netrw_banner = 0
" let g:netrw_liststyle = 3
" let g:netrw_browse_split = 3
" let g:netrw_altv = 1
" let g:netrw_winsize = 25
" set autoindent

filetype plugin indent on
" show existing tab with 4 spaces width
set tabstop=4
" when indenting with '>', use 4 spaces width
set shiftwidth=4
" On pressing tab, insert 4 spaces
"set expandtab
" Show tab characters
"set list
set listchars=tab:\|.

set undofile
set undodir=~/.vim/undodir

" MacOS Defaults
set modelines=0     " CVE-2007-2438

" Normally we use vim-extensions. If you want true vi-compatibility
" remove change the following statements
set nocompatible    " Use Vim defaults instead of 100% vi compatibility
set backspace=2     " more powerful backspacing

" Don't write backup file if vim is being called by "crontab -e"
au BufWrite /private/tmp/crontab.* set nowritebackup nobackup
" Don't write backup file if vim is being called by "chpass"
au BufWrite /private/etc/pw.* set nowritebackup nobackup

let skip_defaults_vim=1
" Fix for slow airline
"let g:airline_skip_empty_sections = 1
let g:airline_highlighting_cache = 1
let g:airline_exclude_filetypes = ['nerdtree']

"Enable mouse
"set mouse=a

" Highlight rogue whitespaces
highlight WhitespaceEOL ctermbg=red guibg=red
match WhitespaceEOL /\s\+$/

"Ycm gotodefinition
map <c-j>  :YcmCompleter GoToDefinitionElseDeclaration<CR>
let g:ycm_confirm_extra_conf = 1
let g:ycm_key_list_select_completion = ['<TAB>']
let g:ycm_key_list_previous_completion = ['<S-TAB>']
let g:ycm_autoclose_preview_window_after_completion=1
let g:ycm_show_diagnostics_ui = 0

"NerdTree settings
map <C-n> :NERDTreeToggle<CR>
"autocmd vimenter * NERDTree
"autocmd bufenter * if (winnr("$") == 1 && exists("b:NERDTreeType") && b:NERDTreeType == "primary") | q | endif
"autocmd bufenter * if (winnr("$") == 1 && exists("b:NERDTree") && b:NERDTree.isTabTree()) | q | endif
" Fix for NERDTree closing all buffers when one is closed
nnoremap \d :bp<cr>:bd #<cr>


"Buffer keymaps
map <silent> <F3> :bp<CR>
map <silent> <F2> :bn<CR>
