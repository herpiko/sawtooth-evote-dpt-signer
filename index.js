const fs = require('fs');
const {createHash} = require('crypto')
const express = require('express');
const bodyParser = require('body-parser');
const ed25519 = require('ed25519');
const base64 = require('js-base64').Base64;
const request = require('request');
const forge = require('node-forge');
const pki = forge.pki;
const cbor = require('cbor')
const submit = require('./submitter/dpt-admin.js');
const app = express();
const port = process.env.PORT || 3000
const dptNode = process.argv[2];
const https = require('https');
if (!dptNode) throw("Please specify the node (node index host:port)");

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));

const privateKey = 'af9881fe34edfd3463cf3e14e22ad95a0608967e084d3ca1fc57be023040de590c32c468980d40237f4e44a66dec3beb564b3e1394a4c6df1da2065e3afc1d81';
const publicKey = '0c32c468980d40237f4e44a66dec3beb564b3e1394a4c6df1da2065e3afc1d81';
const pk = new Buffer(privateKey, 'hex');
const p = new Buffer(publicKey, 'hex');

// Kunci Suara
const kunciSuaraPem = fs.readFileSync('./ejbca/KPU_Machines/KunciSuara/kunci_suara.pem', 'utf8');
const kunciSuara = pki.certificateFromPem(kunciSuaraPem);
const kunciSuaraPKPem = fs.readFileSync('./ejbca/KPU_Machines/KunciSuara/kunci_suara.plain.key', 'utf8');
const kunciSuaraPK = pki.privateKeyFromPem(kunciSuaraPKPem);

// TODO mutual auth

const dump = (filter) => {
  return new Promise((resolve, reject) => {
    // In real world, this handled by dedicated driver
    // See : https://sawtooth.hyperledger.org/docs/core/releases/1.0/app_developers_guide/event_subscriptions.html
    let obj = {
      data : [],
      total : 0,
    }
    let next = true;
    let promises = [];
    let nextUrl;
  
    var get = (next) => {
      let uri = next || 'http://' + (filter && filter.dptNode ? filter.dptNode : dptNode) + '/transactions?limit=100';
      console.log('Fetching ' + uri);
      request.get({uri: uri}, (err, resp) => {
        if (err) return reject(err);
        let body = JSON.parse(resp.body);
        if (body.data && body.data.length > 0) {
          obj.total += body.data.length;
          for (var i in body.data) {
            // Ignore sawtooth related families
            if (body.data[i].header.family_name === 'sawtooth_settings') {
              obj.total--;
              continue;
            }
            let item = {};
            item['familyName'] = body.data[i].header.family_name;
            item['stateId'] = body.data[i].header.inputs[0];
            let buf = Buffer.from(body.data[i].payload, 'base64');
            let decoded = cbor.decode(buf);
            item['state'] = decoded.Value
            if (filter && filter.familyName && filter.familyName !== item.familyName) {
              obj.total--;
              continue;
            }
            if (filter && filter.state && filter.state !== decoded.Value) {
              obj.total--;
              continue;
            }
            obj.data.push(item);
          }
        }
        if (body.paging && body.paging.next) {
          get(body.paging.next);
        } else {
          next = false;
          resolve(obj);
        }
      });
    }
    get();
  });
}

app.get('/', (req, res) => {
  let body = 'Evote<br/>Target ledger : ' + dptNode;
  body += '<ul>';
  body += '<li><a href="/api/dpt-transactions">DPT transactions</a></li>';
  body += '<li><a href="/api/dpt-dump">DPT dump</a></li>';
  body += '<li><a href="/api/province-vote-transactions">province vote transactions</a></li>';
  body += '<li><a href="/api/province-voter-transactions">province voter transactions</a></li>';
  body += '<li><a href="/api/province-transactions">province transactions</a></li>';
  body += '<li><a href="/api/tallying">tallying</a></li>';
  body += '<li><a href="/api/final-report">final report</a></li>';
  body += '</ul>';
  res.send(body);
});

app.post('/api/activate', (req, res) => { // Restricted to DPT
  if (!req.body.r) return res.send({error : 'r is required'});
  if (!req.body.voterId) return res.send({error : 'voterId is required'});
  if (req.body.r.length != 44) return res.send({error : 'The length of random unique string must be 44'});
  console.log(req.body);


  const nameHash = createHash('sha512')
    .update(createHash('sha256').update(req.body.voterId).digest('hex'))
    .digest('hex');
  const familyNameHash = createHash('sha512').update('provinceDPT').digest('hex');
  const stateId = familyNameHash.substr(0,6) + nameHash.substr(-64);
  console.log(stateId);

  request.get({url:'http://' + dptNode + '/state/' + stateId}, (err, response) => {
    if (err) return res.send(err);
    if (!response.body) return res.send('invalid state id');
    let body = JSON.parse(response.body); 
    let buf;
    try {
      buf = Buffer.from(body.data, 'base64');
    } catch(e) {
      return res.send({status : 'NOT_REGISTERED'});
    }
    let decoded = cbor.decode(buf);
    if (decoded[Object.keys(decoded)[0]] === 'ready') {
      console.log('ALREADY_ACTIVATED');
      return res.send({status : 'ALREADY_ACTIVATED'});
    }
    if (decoded[Object.keys(decoded)[0]] !== 'registered') {
      console.log('NOT_REGISTERED');
      return res.send({status : 'NOT_REGISTERED'});
    }
    console.log('Activating...');
    submit({voterId : req.body.voterId, verb : 'ready', node : dptNode})
    .then((result) => {
      if (result.status !== 'COMMITTED') {
        console.log('NOT COMMITED');
        res.send(result);
        return;
      }
      const msg = new Buffer(req.body.r);
      const signature = ed25519.Sign(msg, { privateKey: pk, publicKey: p });
      console.log('signed key value for ' + req.body.voterId + ' : ' + req.body.r + '_' + signature.toString('base64'));
      console.log('The signature, separated : ' + signature.toString('base64'));
      let obj = {signedKey : req.body.r + '_' + signature.toString('base64'), status : 'READY'};
      res.send(obj);
    })
    .catch((err) => {
      console.log(err);
      res.send({error : err});
    });
  });
});

app.get('/api/dpt-transactions', (req, res) => { // Restricted to admin
  request.get({uri: 'http://' + dptNode + '/transactions'}, (err, resp) => {
    if (!resp || !resp.body) {
      res.send({});
      return;
    }
    res.send(JSON.parse(resp.body));
  });
});

app.get('/api/dpt-dump', (req, res) => { // Restricted to admin
  dump(req.query)
  .then((result) => {
    res.send(result);
  });
});

app.get('/api/dpt-state/:id', (req, res) => {
  request.get({uri: 'http://' + dptNode + '/state/' + req.params.id}, (err, resp) => {
    if (err) return res.send({error : err});
    let body = JSON.parse(resp.body);
    let data = body.data;
    if (!data) {
      return res.send({status : 'NOT_REGISTERED'});
    }
    let buf = Buffer.from(data, 'base64');
    let decoded = cbor.decode(buf);
    decoded['head'] = body.head;
    res.send(decoded);
  });
});

app.get('/api/province-transactions', (req, res) => {
  let filter = { dptNode: 'province-vote-52.skripsi.local:12352'}
  dump(filter)
  .then((result) => {
    res.send(result);
  });
});

app.get('/api/province-vote-transactions', (req, res) => {
  let filter = { dptNode: 'province-vote-52.skripsi.local:12352', familyName: 'provinceVote' }
  dump(filter)
  .then((result) => {
    res.send(result);
  });
});

app.get('/api/province-voter-transactions', (req, res) => {
  let filter = { dptNode: 'province-vote-52.skripsi.local:12352', familyName: 'provinceVoter' }
  dump(filter)
  .then((result) => {
    res.send(result);
  });
});

app.get('/api/final-report', (req, res) => {
  let filter = { dptNode: 'province-vote-52.skripsi.local:12352', familyName: 'final' }
  dump(filter)
  .then((result) => {
    res.send(result);
  });
});

app.get('/api/tallying', (req, res) => {
  let tallyed = []
  let filter = { dptNode: 'province-vote-52.skripsi.local:12352', familyName: 'provinceVote'}
  dump(filter)
  .then((votes) => {
    filter.familyName = 'provinceVoter';
    dump(filter)
    .then((voters) => {
      if (voters.data.length != votes.data.length) {
        res.send({error: 'Unmatched length.'});
        return;
      }
      let result = { data: [], candidates: {}};
      for (let i in votes.data) {
        let payload = JSON.parse(base64.decode(votes.data[i].state));
        let key = Object.keys(payload)[0]
        const p7 = forge.pkcs7.messageFromPem(payload[key].z);
        p7.decrypt(p7.recipients[0], kunciSuaraPK)
        if (!result.candidates[p7.content.data]) result.candidates[p7.content.data] = 0;
        result.candidates[p7.content.data]++;
        let voter = JSON.parse(base64.decode(voters.data[i].state))
        payload = { 
          vote: p7.content.data,
          idv: key,
          n: payload[key].n,
          pairedVoter: voter
        }
        let id = voters.data[i].stateId
        result.data.push(payload)
      }
      res.send(result);
    });
  });
});

// SSL keys
const options = {
  key : fs.readFileSync('./ejbca/KPU_Machines/EvoteServer/evote-server.skripsi.local.plain.key'),
  cert : fs.readFileSync('./ejbca/KPU_Machines/EvoteServer/evote-server.skripsi.local.pem'),
  ca : fs.readFileSync('./ejbca/CA/KPUIntermediateCA-chain.pem'),
  requestCert : true,
}

var httpsServer = https.createServer(options, app);
httpsServer.listen(3443);

console.log('Evote server started on port ' + port + ' against ledger ' + dptNode);
