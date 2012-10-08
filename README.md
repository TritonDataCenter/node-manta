# Manta client tools

Repository: <git@git.joyent.com:node-manta.git>
Browsing: <https://mo.joyent.com/node-manta>
Who: Mark Cavage
Tickets/bugs: <https://devhub.joyent.com/jira/browse/MANTA>

## Overview

This repository provides a set of tools for interacting with Manta.

## Set up a Manta

You must start with a working Manta install.  In the global zone of a fresh SDC
headnode install, run:

    # manta-init
    ...
    # manta-deploy-coal

You can also deploy on hardware using `manta-deploy-lab` instead of `manta-deploy-coal`.

## Set up DNS in your working zone

In order to refer to manta using `manta.coal.joyent.us` or
`manta.bh1-kvm1.joyent.us`, you'll need to add Manta's nameservers to your
environment's /etc/resolv.conf, whether that's on your Macbook or a SmartOS
zone.  To find the nameservers, first find the zones that were deployed above
using `vmadm list`.  They'll be the zones with aliases like
`ns-1.ns.coal.joyent.us-...`.  COAL will have 1 nameserver, while lab machines
will have 3.  Get each one's IP address with:

    # vmadm get ZONE_UUID | json nics.0.ip

and add each one to /etc/resolv.conf.

## Set up a user for manta

You'll need a user with an ssh key stored in UFDS.  The easiest way to do that is to make sure your key is in node-manta.git:data/keys.ldif and then run this in the global zone:

    # sdc-ldap add -f /path/to/keys.ldif

## Set up your environment

These instructions assume COAL, user "dap", and that your key is
~/.ssh/id\_rsa.

    $ export MANTA_URL=https://manta.coal.joyent.us/
    $ export MANTA_USER=dap
    $ export MANTA_KEY_ID=$(ssh-keygen -l -f ~/.ssh/id_rsa | awk '{print $2}')

## Use these tools

First, build this repo:

    $ make

This requires that "npm" be in your path.

Now you can use the tools in "bin".
