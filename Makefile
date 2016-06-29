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

# Use "TEST_FILTER" to limit test files run, e.g.:
#    make test TEST_FILTER=muntar
.PHONY: test
test: deps
	unset MANTA_DEFAULT_CONTENT_TYPE; \
		if [[ -z "$(TEST_FILTER)" ]]; then \
			$(NODEUNIT) test/*.test.js; \
		else \
			echo "# Running subset of tests matching TEST_FILTER=$(TEST_FILTER)"; \
			$(NODEUNIT) $(NODEUNIT_ARGS) $(shell ls test/*.test.js | grep "$(TEST_FILTER)"); \
		fi

#
# Test with a bunch of node versions.
#
# This requires a "test/node.paths" file that looks something like
# "test/node.paths.example".
#
.PHONY: testall
testall: test6 test5 test4 test012 test010

.PHONY: test6
test6:
	@([[ -f test/node.paths ]] || (echo "no test/node.paths" && exit 1) \
		&& echo "# Test with node `$(shell awk '/^6/ { print $$2 }' test/node.paths)/node --version`" \
		&& PATH="$(shell awk '/^6/ { print $$2 }' test/node.paths):$(PATH)" \
			NPM_CONFIG_LOGLEVEL=silent NPM_CONFIG_PROGRESS=false \
			make clean test)

.PHONY: test5
test5:
	@([[ -f test/node.paths ]] || (echo "no test/node.paths" && exit 1) \
		&& echo "# Test with node `$(shell awk '/^5/ { print $$2 }' test/node.paths)/node --version`" \
		&& PATH="$(shell awk '/^5/ { print $$2 }' test/node.paths):$(PATH)" \
			NPM_CONFIG_LOGLEVEL=silent NPM_CONFIG_PROGRESS=false \
			make clean test)

.PHONY: test4
test4:
	@([[ -f test/node.paths ]] || (echo "no test/node.paths" && exit 1) \
		&& echo "# Test with node `$(shell awk '/^4/ { print $$2 }' test/node.paths)/node --version`" \
		&& PATH="$(shell awk '/^4/ { print $$2 }' test/node.paths):$(PATH)" \
			NPM_CONFIG_LOGLEVEL=silent NPM_CONFIG_PROGRESS=false \
			make clean test)

.PHONY: test012
test012:
	@([[ -f test/node.paths ]] || (echo "no test/node.paths" && exit 1) \
		&& echo "# Test with node `$(shell awk '/^0\.12/ { print $$2 }' test/node.paths)/node --version`" \
		&& PATH="$(shell awk '/^0\.12/ { print $$2 }' test/node.paths):$(PATH)" \
			NPM_CONFIG_LOGLEVEL=silent NPM_CONFIG_PROGRESS=false \
			make clean test)

.PHONY: test010
test010:
	@([[ -f test/node.paths ]] || (echo "no test/node.paths" && exit 1) \
		&& echo "# Test with node `$(shell awk '/^0\.10/ { print $$2 }' test/node.paths)/node --version`" \
		&& PATH="$(shell awk '/^0\.10/ { print $$2 }' test/node.paths):$(PATH)" \
			NPM_CONFIG_LOGLEVEL=silent NPM_CONFIG_PROGRESS=false \
			make clean test)


$(MAN_OUTDIR):
	mkdir -p $@

$(MAN_OUTDIR)/%.1: $(MAN_ROOT)/%.md | $(MAN_OUTDIR)
	$(MD2MAN) $^ > $@

.PHONY: manpages
manpages: $(MAN_OUTPAGES)


include ./tools/mk/Makefile.deps
include ./tools/mk/Makefile.targ
