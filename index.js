const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const ed25519 = require('ed25519');
const submit = require('./submitter/dpt-admin.js');
const app = express();
const port = process.env.PORT || 8020
const dptNode = process.argv[2];

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));

const privateKey = 'af9881fe34edfd3463cf3e14e22ad95a0608967e084d3ca1fc57be023040de590c32c468980d40237f4e44a66dec3beb564b3e1394a4c6df1da2065e3afc1d81';
const publicKey = '0c32c468980d40237f4e44a66dec3beb564b3e1394a4c6df1da2065e3afc1d81';
const pk = new Buffer(privateKey, 'hex');
const p = new Buffer(publicKey, 'hex');

app.post('/api/register', function(req, res) {
  if (!req.body.r) return res.send({error : 'r is required'});
  if (req.body.r.length != 16) return res.send({error : 'The length of random unique string must be 16'});
  // TODO 
  // - set the voter to 'ready' on DPT ledger
  // - 
  submit({voterId : req.body.r, verb : 'ready', node : dptNode})
  .then((result) => {
    const msg = new Buffer(req.body.r);
    const signature = ed25519.Sign(msg, { privateKey: pk, publicKey: p });
    res.send({k : req.body.r + signature.toString('base64')});
  })
  .catch((err) => {
    res.send({error : err});
  });
});

app.listen(port);
console.log('DPT signer started on port ' + port);
