#
# Copyright 2019 Joyent, Inc.
# Copyright 2024 MNX Cloud, Inc.
#

#
# Tools
#
# Get md2man-roff from <https://github.com/sunaku/md2man>
MD2MAN                  := md2man-roff
NPM			:= npm
TAP_EXEC = ./node_modules/.bin/tap
TEST_JOBS ?= 10
TEST_TIMEOUT_S ?= 1200
TEST_FILTER ?= .*

#
# Files
#
DOC_FILES	 = index.md
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

COMPLETION_CMDS := $(shell find bin -type f)
COMPLETION_FILE=share/manta.completion

#
# Repo-specific targets
#
.PHONY: all
all: $(SMF_MANIFESTS) deps completion

.PHONY: deps
deps $(TAP_EXEC): | $(REPO_DEPS) $(NPM_EXEC)
	$(NPM_ENV) $(NPM) install


.PHONY: ensure-node-v6-or-greater-for-test-suite
ensure-node-v6-or-greater-for-test-suite: | $(TAP_EXEC)
	@NODE_VER=$(shell node --version) && \
	    ./node_modules/.bin/semver -r '>=6.x' $$NODE_VER >/dev/null || \
	    (echo "error: node-tap@12 runner requires node v6 or greater: you have $$NODE_VER"; exit 1)

.PHONY: test
test: ensure-node-v6-or-greater-for-test-suite | $(TAP_EXEC)
	@testFiles="$(shell ls test/unit/*.test.js test/integration/*.test.js | egrep "$(TEST_FILTER)")" && \
	    test -z "$$testFiles" || \
	    NODE_NDEBUG= $(TAP_EXEC) --timeout $(TEST_TIMEOUT_S) -j $(TEST_JOBS) -o ./test.tap $$testFiles


$(MAN_OUTDIR):
	mkdir -p $@

$(MAN_OUTDIR)/%.1: $(MAN_ROOT)/%.md | $(MAN_OUTDIR)
	$(MD2MAN) $^ > $@

.PHONY: manpages
manpages: $(MAN_OUTPAGES)


#
# Each m* tool has a '--completion' option to emit Bash completion code. We
# gather all those to a share/manta.completion file for users to source.
#

.PHONY: completion
completion: $(COMPLETION_FILE)

$(COMPLETION_FILE): $(COMPLETION_CMDS) lib/create_client.js
	echo "# node-manta tools v$(shell cat package.json | json version) completion" >$@
	echo $(COMPLETION_CMDS) | xargs -n1 basename | sed -E 's/(.*)/#   \1(1)/' >>$@
	echo "" >>$@
	for cmd in $(COMPLETION_CMDS); do \
		$$cmd --completion | grep -v '^#' >>$@; \
	done

CLEAN_FILES += $(COMPLETION_FILE)

# Ensure CHANGES.md and package.json have the same version.
.PHONY: versioncheck
versioncheck:
	@echo version is: $(shell cat package.json | json version)
	[[ `cat package.json | json version` == `grep '^## ' CHANGES.md | head -2 | tail -1 | awk '{print $$2}'` ]]

check:: versioncheck

.PHONY: cutarelease
cutarelease: $(COMPLETION_FILE) versioncheck
	[[ -z `git status --short` ]]  # If this fails, the working dir is dirty.
	@which json 2>/dev/null 1>/dev/null && \
	    ver=$(shell json -f package.json version) && \
	    name=$(shell json -f package.json name) && \
	    publishedVer=$(shell npm view -j $(shell json -f package.json name)@$(shell json -f package.json version) 2>/dev/null | json version) && \
	    if [[ -n "$$publishedVer" ]]; then \
		echo "error: $$name@$$ver is already published to npm"; \
		exit 1; \
	    fi && \
	    echo "** Are you sure you want to tag and publish $$name@$$ver to npm?" && \
	    echo "** Enter to continue, Ctrl+C to abort." && \
	    read
	ver=$(shell cat package.json | json version) && \
	    date=$(shell date -u "+%Y-%m-%d") && \
	    git tag -a "v$$ver" -m "version $$ver ($$date)" && \
	    git push origin "v$$ver" && \
	    npm publish


include ./tools/mk/Makefile.deps
include ./tools/mk/Makefile.targ
