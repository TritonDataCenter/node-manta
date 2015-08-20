#
# Copyright 2015 Joyent, Inc.
#

#
# Tools
#
# Get md2man-roff from <https://github.com/sunaku/md2man>
MD2MAN                  := md2man-roff
NODEUNIT		:= ./node_modules/.bin/nodeunit
NPM			:= npm

#
# Files
#
DOC_FILES	 = index.restdown
JS_FILES	:= $(shell find lib test -name '*.js')
JS_FILES	+= $(shell find bin -type f -not -name '.*.swp')
JSL_CONF_NODE	 = tools/jsl.node.conf
JSL_FILES_NODE   = $(JS_FILES)
JSSTYLE_FILES	 = $(JS_FILES)
JSSTYLE_FLAGS    = -f tools/jsstyle.conf

CLEAN_FILES += node_modules

include ./tools/mk/Makefile.defs

#
# Variables
#

MAN_PAGES       := $(shell ls docs/man)
MAN_OUTDIR      := man/man1
MAN_OUTPAGES=$(MAN_PAGES:%.md=$(MAN_OUTDIR)/%.1)
MAN_ROOT        := docs/man

#
# Repo-specific targets
#
.PHONY: all
all: $(SMF_MANIFESTS) deps

.PHONY: deps
deps: | $(REPO_DEPS) $(NPM_EXEC)
	$(NPM_ENV) $(NPM) install

.PHONY: test
test: deps
	unset MANTA_DEFAULT_CONTENT_TYPE; \
	$(NODEUNIT) test

$(MAN_OUTDIR):
	mkdir -p $@

$(MAN_OUTDIR)/%.1: $(MAN_ROOT)/%.md | $(MAN_OUTDIR)
	$(MD2MAN) $^ > $@

.PHONY: manpages
manpages: $(MAN_OUTPAGES)


include ./tools/mk/Makefile.deps
include ./tools/mk/Makefile.targ
