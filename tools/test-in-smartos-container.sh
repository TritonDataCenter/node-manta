#!/bin/bash
#
# Copyright 2016, Joyent, Inc.
#

#
# Provision a SmartOS container (using the given 'triton' profile) and
# run the test suite with a number of node versions.
#

declare TRACE
if [[ -n "$TRACE" ]]; then
    export PS4='[\D{%FT%TZ}] ${BASH_SOURCE}:${LINENO}: ${FUNCNAME[0]:+${FUNCNAME[0]}(): }'
    set -o xtrace
fi
set -o errexit
set -o pipefail


# ---- globals

SSH_OPTIONS="-q -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
SSH="ssh $SSH_OPTIONS"

instName=testnodemanta0
instToDelete=


# ---- support functions

function fatal {
    echo "$(basename $0): fatal error: $*" >&2
    exit 1
}

function onexit {
    local status=$?
    [[ $status -ne 0 ]] || exit 0

    # Cleanup.
    if [[ -n "$instToDelete" ]]; then
        triton $TRITON_OPTS instance delete -w $instToDelete
    fi

    echo "error exit status $status (run 'TRACE=1 $0' for more info)" >&2
}

function usage {
    echo "Usage:"
    echo "  test-in-smartos-container.sh [OPTIONS...]"
    echo ""
    echo "Options:"
    echo "  -h          Print this help and exit."
    echo "  -p PROFILE  Triton profile to use for the container."
    echo "  -i INST     Use the given instance, rather than provisioning a new one."
    echo "  -b BRANCH   Branch of node-manta.git to test."
    echo ""
    echo "This expects that you have a 'MANTA_\*' envvars setup that will allow"
    echo "access to a Manta against which to run the test suite from the"
    echo "provisioned container."
}


# ---- mainline

trap 'onexit' EXIT

optProfile=
optInst=
optBranch=
while getopts "hp:i:b:" opt; do
    case "$opt" in
        h)
            usage
            exit 0
            ;;
        p)
            optProfile=$OPTARG
            ;;
        i)
            optInst=$OPTARG
            ;;
        b)
            optBranch=$OPTARG
            ;;
        *)
            usage
            exit 1
            ;;
    esac
done
shift $((OPTIND - 1))


TRITON_OPTS=
if [[ -n "$optProfile" ]]; then
    TRITON_OPTS="$TRITON_OPTS -p $optProfile"
fi


# Assert have MANTA_ vars
[[ -n "$MANTA_URL" ]] || fatal "MANTA_URL is not set"
[[ -n "$MANTA_USER" ]] || fatal "MANTA_USER is not set"
[[ -n "$MANTA_KEY_ID" ]] || fatal "MANTA_KEY_ID is not set"

# Provision a test container, unless given one (-i INST).
if [[ -n "$optInst" ]]; then
    instName=$optInst
else
    echo "# Creating new inst (name=$instName) in which to test"
    triton $TRITON_OPTS create -w -n $instName minimal-multiarch g4-highcpu-1G
    instToDelete=$instName
fi
instIp=$(triton $TRITON_OPTS ip $instName)
echo "# Testing with inst $instName (IP $instIp)"

# SSH in and setup.
$SSH -T -A root@$instIp <<SCRIPT

if [[ -n "$TRACE" ]]; then
    export PS4='\${BASH_SOURCE}:\${LINENO}: \${FUNCNAME[0]:+\${FUNCNAME[0]}(): }'
    set -o xtrace
fi
set -o errexit
set -o pipefail

PATH=/usr/bin:/usr/sbin:/opt/local/bin:/opt/local/sbin

function fatal {
    echo "\$0: fatal error: \$*"
    exit 1
}

export MANTA_URL=$MANTA_URL
export MANTA_USER=$MANTA_USER
export MANTA_KEY_ID=$MANTA_KEY_ID
export MANTA_TLS_INSECURE=$MANTA_TLS_INSECURE

miscLogPath=/root/misc-\$(date '+%s').log

# Setup
echo "# Setup container (setup/install details logging to \$miscLogPath)"
pkgin -y in git gmake >\$miscLogPath 2>&1
if [[ -d node-manta ]]; then
    (cd node-manta && git pull) >\$miscLogPath 2>&1
else
    git clone https://github.com/joyent/node-manta.git >\$miscLogPath 2>&1
fi
if [[ -n "$optBranch" ]]; then
    (cd node-manta && git checkout nouveau) >\$miscLogPath 2>&1
fi

# TODO: pkgsrc doesn't have node 6 yet.
VERS="0.10 0.12 4 5"
for ver in \$VERS; do
    echo ""
    echo ""
    pkgName=\$(pkgin search nodejs | grep ^nodejs-\$ver | awk '{print \$1}')
    echo "# -- Test node v\$ver (pkgName=\$pkgName)"

    # Uninstall current node package, if any.
    echo ""
    currPkg=\$(pkg_info | (grep ^nodejs- || true) | awk '{print \$1}')
    echo "# install nodejs package (currPkg=\$currPkg)"
    if [[ "\$currPkg" != "\$pkgName" ]]; then
        if [[ -n "\$currPkg" ]]; then
            pkg_delete \$currPkg >\$miscLogPath 2>&1
        fi
        pkg_add \$pkgName >\$miscLogPath 2>&1
    fi
    node --version

    echo ""
    echo "# re-build node-manta"
    cd /root/node-manta
    make clean all >\$miscLogPath 2>&1

    echo ""
    echo "# run the test suite"
    cd /root/node-manta
    make test
done

exit 0
SCRIPT

# Clean up inst.
if [[ -n "$instToDelete" ]]; then
    triton $TRITON_OPTS instance delete -w $instToDelete
fi
