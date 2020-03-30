
https://github.com/docker/libnetwork/blob/master/docs/remote.md

mkdir /etc/docker/plugins/

cp etc/simple-bridge.json /etc/docker/plugins/

:::: example

docker network create -d simple-bridge net2 --ipam-driver null

docker run --rm -ti --network net2 alpine


