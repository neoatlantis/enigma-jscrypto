/*
 * ECDSA and ECDH implementation utilizing JSBN library.
 */
(function(root){
//////////////////////////////////////////////////////////////////////////////

function invoker(_ecparams, _ecdsa, _ecurve, _bigi){


/****************************************************************************/

function EC(curveName){
    var self = this;

    var bigiPrivateKey = null, bigiPublicKey = null;
    var ecparams = _ecparams(curveName);

    if(!ecparams) throw Error('unknown-ec-curve-name');
    var ecdsa = new _ecdsa(ecparams);


    /* Interface for initializing */

    this.setPrivateKey = function(privateKeyArray){
        if(!Array.isArray(privateKeyArray))
            throw new Error('invalid-parameter');
        initWithPrivateKey(privateKeyArray);
    };

    this.setPublicKey = function(publicKeyArray){
        if(!Array.isArray(publicKeyArray))
            throw new Error('invalid-parameter');
        initWithPublicKey(publicKeyArray);
    };

    /* Internal Function for initializing */

    // remove or add functions to this instance.
    function init(prv){
        if(prv){
            self.sign = sign;
            self.getDecryptCredential = getDecryptCredential;
            self._computeSecret = _computeSecret;
        };

        self.verify = verify;
        self.getEncryptCredentials = getEncryptCredentials;
        self.getPublicKey = function(){
            return bigiPublicKey;
        };

        delete self.setPrivateKey;
        delete self.setPublicKey;
    };

    function initWithPublicKey(publicKeyArray){
        // convert publicKeyBuffer to array as library required.
        bigiPrivateKey = null;
//        bigiPublicKey = _bigi(publicKeyBuffer.toString('hex'), 16); 
        bigiPublicKey = publicKeyArray;
//        console.log(bigiPublicKey);

        init(false);
    };

    function initWithPrivateKey(privateKeyArray){
        // convert privateKeyBuffer to array as library required.
//        bigiPrivateKey = _bigi(privateKeyBuffer.toString('hex'), 16);
        bigiPrivateKey = _bigi.fromByteArrayUnsigned(privateKeyArray);
            
        // calculate public key.
        var pubPoint = ecparams.getG().multiply(bigiPrivateKey);
        bigiPublicKey = pubPoint.getEncoded(false);

        init(true);
    };


    /* Functions for normal working */

    function sign(digestBuffer){
        if(!$.tools.type.isBuffer(digestBuffer))
            throw Error('invalid-parameter');
        
        var signature = ecdsa.sign(digestBuffer, bigiPrivateKey);

        return new $.node.buffer.Buffer(signature);
    };

    function verify(digestBuffer, signatureBuffer){
        if(!(
            $.tools.type.isBuffer(digestBuffer) &&
            $.tools.type.isBuffer(signatureBuffer)
        ))
            throw Error('invalid-parameter');

        try{
//            var signatureArray = _bigi(signatureBuffer.toString('hex'), 16);
            var signatureArray = buffer2array(signatureBuffer);
            var ret = ecdsa.verify(
                digestBuffer,
                signatureArray, 
                bigiPublicKey
            );
        } catch(e){
            console.log('error', e);
            return false;
        };

        return ret;
    };

    function _computeSecret(anotherPublicKeyArray){
        if(!Array.isArray(anotherPublicKeyArray))
            throw Error('invalid-parameter');

        var Q = _ecurve.ECPointFp.decodeFrom(
            ecparams.getCurve(), 
            anotherPublicKeyArray
        );

        var S = Q.multiply(bigiPrivateKey);

        return S.getEncoded().slice(1);
    };

    function _XOR(sharedsecret, salt, dataBuf){
        var cryptStream = new root.hash('BLAKE2s').pbkdf2(
            sharedsecret,
            salt,
            1024,
            dataBuf.length
        );

        var resultStream = root.util.buffer.xor(dataBuf, cryptStream);
        return resultStream;
    };

    
    // TODO remove buffer
    function getEncryptCredentials(dataBuf){
        if(!root.util.type(dataBuf).isArrayBuffer())
            throw new Error('invalid-parameter');

        // create another EC instance with a new private key, then use the new
        // instance to calculate SharedSecret with the public key of this
        // instance. Encryption is done by using this SharedSecret as key.
        // As return value the public key of the created new EC instance is
        // attached.
        var tempEC = new EC(curveName),
            tempCredential = new root.util.srand().bytes(128);

        tempEC.setPrivateKey(tempCredential);
        
        var sharedsecret = tempEC._computeSecret(self.getPublicKey()),
            tempPublicKey = tempEC.getPublicKey();

        // use XOR to encrypt
        var resultStream = _XOR(sharedsecret, tempPublicKey, dataBuf);
        
        // pack the result
        var lenBuf = new Uint16Array(1);
        lenBuf[0] = tempPublicKey.length;

        return root.util.buffer.concat([
            lenBuf.buffer,
            tempPublicKey,
            resultStream,
        ]);
    };

    function getDecryptCredential(dataBuf){
        if(!(
            root.util.type(dataBuf).isArrayBuffer() &&
            dataBuf.byteLength > 2
        ))
            throw new Error('invalid-parameter');

        // first extract the public key of the created instance from dataBuf.
        // then calculate SharedSecret using the extracted public key and
        // the private key of this instance.

        var lenBuf = dataBuf.slice(0, 2),
            dataBuf = dataBuf.slice(2);

        var splitLen = new Uint16Array(lenBuf)[0];
        if(dataBuf.length <= splitLen)
            throw new Error('invalid-ciphertext');

        var tempPublicKey = dataBuf.slice(0, splitLen),
            resultStream = dataBuf.slice(splitLen);

        var sharedsecret = _computeSecret(tempPublicKey);

        return _XOR(sharedsecret, tempPublicKey, resultStream);
    };


    return this;
};





/****************************************************************************/
root.asymcipher.ec = EC;
return EC;
};  // end of invoker


if('undefined' != typeof module && 'undefined' != typeof module.exports){
    var _ecparams = require('./ecparams.js'),
        _ecdsa = require('./ecdsa.js'),
        _ecurve = require('./ecurve.js'),
        _bigi = require('./bigi.js');
    module.exports = invoker(_ecparams, _ecdsa, _ecurve, _bigi);
} else
    define(
        [
            'asymcipher/ec/ecparams',
            'asymcipher/ec/ecdsa',
            'asymcipher/ec/ecurve',
            'asymcipher/ec/bigi'
        ],
        function(_ecparams, _ecdsa, _curve, _bigi){
            return invoker(_ecparams, _ecdsa, _ecurve, _bigi);
        }
    );
//////////////////////////////////////////////////////////////////////////////
})(__enigma_jscrypto__);