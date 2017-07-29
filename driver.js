
var fs = require('fs');
var path = require('path');
var child_process = require('child_process');
var config = require('./config');

function Plugin_Activate(req) {
    return new Promise(function (resolve, reject) {
        resolve({ Implements: ['NetworkDriver']});
    });
}

function NetworkDriver_GetCapabilities(req) {
    return new Promise(function (resolve, reject) {
        resolve({ Scope: 'local' });
    });
}

/* req: {
	"NetworkID": string,
	"IPv4Data" : [
	{
		"AddressSpace": string,
		"Pool": ipv4-cidr-string,
		"Gateway" : ipv4-cidr-string,
		"AuxAddresses": {
			"<identifier1>" : "<ipv4-address1>",
			"<identifier2>" : "<ipv4-address2>",
			...
		}
	},
	],
	"IPv6Data" : [
	{
		"AddressSpace": string,
		"Pool": ipv6-cidr-string,
		"Gateway" : ipv6-cidr-string,
		"AuxAddresses": {
			"<identifier1>" : "<ipv6-address1>",
			"<identifier2>" : "<ipv6-address2>",
			...
		}
	},
	],
	"Options": {
		...
	}
}
*/
function NetworkDriver_CreateNetwork(req) {
    return new Promise(function (resolve, reject) {

        var cfg = config.load(req.NetworkID, /* fail_ok: */ true);

        if (!cfg) {
            cfg = JSON.parse(JSON.stringify(req));

            cfg.bridge_name = 'br' + rndHex8chars();

            config.store(req.NetworkID, cfg);
        }

        var ret = child_process.spawnSync('brctl', ['addbr', cfg.bridge_name ]);

        if (ret.status != 0) {
            reject('error create bridge : ' + ret.stderr.toString());
            return;
        }

        var ret = child_process.spawnSync('ip', ['link', 'set', 'dev', cfg.bridge_name, 'up']);

        if (ret.status != 0) {
            reject('error up bridge : ' + ret.stderr.toString());
            return;
        }


        resolve({});
    });
}

/* req: {
	"NetworkID": string
}
*/
function NetworkDriver_DeleteNetwork(req) {
    return new Promise(function (resolve, reject) {
        var cfg = config.load(req.NetworkID, /* fail_ok: */ true);

        if (cfg) {

            var ret = child_process.spawnSync('ip', ['link', 'set', 'dev', cfg.bridge_name, 'down']);

            if (ret.status != 0) {
                reject('error down bridge : ' + ret.stderr.toString());
                return;
            }

            var ret = child_process.spawnSync('brctl', ['delbr', cfg.bridge_name ]);

            if (ret.status != 0) {
                reject('error create bridge : ' + ret.stderr.toString());
                return;
            }

            config.remove(req.NetworkID);

        }

        resolve({});
    });
}

/* req: {
	"NetworkID": string,
	"EndpointID": string,
	"Options": {
		...
	},
	"Interface": {
		"Address": string,
		"AddressIPv6": string,
		"MacAddress": string
	}
}
*/
function NetworkDriver_CreateEndpoint(req) {
    return new Promise(function (resolve, reject) {
        var addr = req.Interface.Address.split('.').map(function (d) { return parseInt(d); });
        var mac = [0x02, 0x42];

        if (addr.length == 4) {
            mac = mac.concat(addr);
        } else {
            mac = mac.concat([
                Math.floor(Math.random() * 256), 
                Math.floor(Math.random() * 256), 
                Math.floor(Math.random() * 256), 
                Math.floor(Math.random() * 256)
            ]);
        }

        mac = mac.map(function (b) { return ((b >> 4) & 0xf).toString(16) + (b & 0xf).toString(16); }).join(':');

        var veth_h = 'veth' + rndHex8chars();
        var veth_c = 'veth' + rndHex8chars();

        var cfg = {
            NetworkID: req.NetworkID,
            EndpointID: req.EndpointID,
            MacAddress: mac,
            veth_h: { name: veth_h },
            veth_c: { name: veth_c },
        };

        console.log("Encpoint cfg: ", cfg);

        config.store(req.EndpointID, cfg);

        var ret = child_process.spawnSync('ip', ['link', 'add', 'name', veth_h, 'type', 'veth', 'peer', 'name', veth_c ]);

        if (ret.status != 0) {
            reject('error create veth link : ' + ret.stderr.toString());
            return;
        }

        var ret = child_process.spawnSync('ip', ['link', 'set', 'dev', veth_c, 'address', mac]);

        if (ret.status != 0) {
            reject('error set veth link mac: ' + ret.stderr.toString());
            return;
        }

        var ret = child_process.spawnSync('ip', ['link', 'set', 'dev', veth_h, 'up']);

        if (ret.status != 0) {
            reject('error set veth link up: ' + ret.stderr.toString());
            return;
        }

        resolve({
                "Interface": {
                    "Address": req.Interface.Address,
                    "AddressIPv6": req.Interface.AddressIPv6,
                    "MacAddress": mac
                }
            });
    });
}

/* req: {
	"NetworkID": string,
	"EndpointID": string
}
*/
function NetworkDriver_DeleteEndpoint(req) {
    return new Promise(function (resolve, reject) {
        var cfg = config.load(req.EndpointID);

        if (!cfg) {
            reject('no cfg data');
            return;
        }

        var ret = child_process.spawnSync('ip', ['link', 'delete', cfg.veth_h.name, 'type', 'veth']);

        if (ret.status != 0) {
            reject('error delete veth link: ' + ret.stderr.toString());
            return;
        }

        config.remove(req.EndpointID);

        resolve({});
    });
}

/* req: {
	"NetworkID": string,
	"EndpointID": string,
	"SandboxKey": string,
	"Options": { ... }
}
*/
function NetworkDriver_Join(req) {
    return new Promise(function (resolve, reject) {
        var cfg_network = config.load(req.NetworkID);
        var cfg_endpoint = config.load(req.EndpointID);

        if (!cfg_network || !cfg_endpoint) {
            reject('no cfg data');
            return;
        }

        var ret = child_process.spawnSync('brctl', ['addif', cfg_network.bridge_name, cfg_endpoint.veth_h.name]);

        if (ret.status != 0) {
            reject('error add interface to bridge: ' + ret.stderr.toString());
            return;
        }

        resolve({
            InterfaceName: {
                    SrcName: cfg_endpoint.veth_c.name,
                    DstPrefix: 'eth',
            },
            Gateway: '',
            GatewayIPv6: '',
            DisableGatewayService: true,
            StaticRoutes: [],
            /*
            {
                    "Destination": string,
                    "RouteType": int,
                    "NextHop": string,
            }
            */
        });
    });
}

/* req: {
	"NetworkID": string,
	"EndpointID": string
}
*/
function NetworkDriver_Leave(req) {
    return new Promise(function (resolve, reject) {
        var cfg_network = config.load(req.NetworkID);
        var cfg_endpoint = config.load(req.EndpointID);

        if (!cfg_network || !cfg_endpoint) {
            reject('no cfg data');
            return;
        }

        var ret = child_process.spawnSync('brctl', ['delif', cfg_network.bridge_name, cfg_endpoint.veth_h.name]);

        if (ret.status != 0) {
            reject('error del interface from bridge: ' + ret.stderr.toString());
            return;
        }

        resolve({});
    });
}

function NetworkDriver_EndpointOperInfo(req) {
    return new Promise(function (resolve, reject) {
        resolve({
            Value: { },
        });
    });
}


function rndHex8chars() {
    return (('00000000' + (Math.floor(Math.random() * 0x100000000)).toString(16)).substr(-8));
}


var call_map = {
    '/Plugin.Activate': Plugin_Activate,
    '/NetworkDriver.GetCapabilities': NetworkDriver_GetCapabilities,
    '/NetworkDriver.CreateNetwork': NetworkDriver_CreateNetwork,
    '/NetworkDriver.DeleteNetwork': NetworkDriver_DeleteNetwork,
    '/NetworkDriver.CreateEndpoint': NetworkDriver_CreateEndpoint,
    '/NetworkDriver.DeleteEndpoint': NetworkDriver_DeleteEndpoint,
    '/NetworkDriver.Join': NetworkDriver_Join,
    '/NetworkDriver.Leave': NetworkDriver_Leave,
    '/NetworkDriver.EndpointOperInfo': NetworkDriver_EndpointOperInfo,
};

module.exports = {
    call_map: call_map,

    Plugin_Activate: Plugin_Activate,
    NetworkDriver_GetCapabilities: NetworkDriver_GetCapabilities,
    NetworkDriver_CreateNetwork: NetworkDriver_CreateNetwork,
    NetworkDriver_DeleteNetwork: NetworkDriver_DeleteNetwork,
    NetworkDriver_CreateEndpoint: NetworkDriver_CreateEndpoint,
    NetworkDriver_DeleteEndpoint: NetworkDriver_DeleteEndpoint,
    NetworkDriver_Join: NetworkDriver_Join,
    NetworkDriver_Leave: NetworkDriver_Leave,
    NetworkDriver_EndpointOperInfo: NetworkDriver_EndpointOperInfo,
};


