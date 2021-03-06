/*
 * Enigma Identity Class
 * =====================
 *
 * In `Enigma`, an identity is a public key bound with a description. It is
 * always self-signed(this is the only signature that exists in Enigma system
 * and doesn't follow the standard format of signing--the signing in message).
 *
 * To initialize a class, 2 ways are provided:
 *  1 by generating an identity. Providing description and selecting algorithm.
 *  2 by providing a serialized public/private part of identity. A passphrase
 *    will be required, when a private part is given.
 *
 * After initialization, public identity part will be always ready to export.
 * The private part will be able to export, only when the initialization is
 * done by generation or by providing a private part. Either way, another
 * passphrase for protecting the private part is required.
 *
 * The identity is also ready for encryption/decryption/signing/verifying based
 * on how it is generated.
 *
 *
 * ===================================
 * IMPORTANT!! Remarks on `pinkey` !!!
 * ===================================
 *  Using a PIN to protect the secret key is necessary, and this PIN serves
 *  also as an identification process, which ties the personality and the data
 *  together.
 *
 *  But we know a PIN is too weak to be directly used as a key to encrypt the
 *  secret. Therefore PBKDF2, scrypt or bcrypt should be applied. Now comes the
 *  problem, that browser and javascript implemented such algorithms are too
 *  slow to be comparable with those code in C. Lacking speed means also that
 *  such protections are no-use(to delay the same length time we have to reduce
 *  the calculation rounds).
 *
 *  --------------------------------------------------------------------------
 *  Therefore, the author is decided, not to accept a PIN and derive the
 *  encryption key natively using javascript, but instead require a `derived
 *  key`. The derivation should be done somewhere else, may be using browser's
 *  `crypto`.
 *  --------------------------------------------------------------------------
 *
 *  In short, you YOURSELF are responsible for providing key good enough to
 *  secure the user's secret(seed used to initialize all user's private key
 *  instances).
 */
(function(tool){
//////////////////////////////////////////////////////////////////////////////
// Adjustable
var config = {
    defaultAlgorithmName: 'NECRAC128', // default and fallback algorithm choice
    subjectRule: /^[0-9a-z\-_\s]{8,255}$/i,
};
/****************************************************************************/

var template = {
    '_': ['constant', new Uint8Array([69, 73]).buffer],
    'subject': 'shortBinary',
    'algorithm': ['enum',
        'NECRAC128',
    ],
    'public': 'binary',
    'secret': 'shortBinary',
        // optional. if given, should be ciphertext protected with pinkey
        // max. length: 255 bytes. should be enough!
    'signature': 'binary',
};

function identity(){
    var self = this;
    var hash = tool.get('hash');
    var buffer = tool.get('util.buffer');
    var getDef = tool.get('cipher.asymmetric.definition');
    var testType = tool.get('util.type');

    var serializer = tool.get('util.serialize')(template);

    var subjectBuf, secretBuf, publicKeyBuf, algorithmName, signatureBuf,
        asymCipher;

    var identityID = false;
    function getID(){
        if(identityID) return identityID;
        identityID = hash().mac(publicKeyBuf, subjectBuf).buffer;
        return identityID;
    };

    ////////////////////// STAGE 1 INITIALIZATION ////////////////////////

    /*
     * Each method of initialization must do followings:
     *  o set `subjectBuf`
     *  o set `publicKeyBuf`
     *  o set `signatureBuf`
     *  o set `algorithmName`
     *  o initialize `asymCipher`
     */

    function initialize(prv){
        self.exportPublic = exportPublic;
        self.verify = verify;
        self.encrypt = encrypt;
        self.getFingerprint = getFingerprint;
        self.getHash = getID;
        self.getSubject = getSubject;
        self.getAlgorithm = getAlgorithm;

        if(prv){
            self.decrypt = decrypt;
            self.sign = sign;
            self.exportPrivate = exportPrivate;
        };
        self.isPrivate = function(){ return Boolean(prv); };

        delete self.generate;
        delete self.loadPublic;
        delete self.loadPrivate;
    };

    this.generate = function(subject, options){
        /*
         * Generate a new identity
         *  1. Test subject validity
         *  2. Fetch random secret
         *  3. set asymCipher, algorithmName
         *  4. get public key and signature
         */
        if(!options) options = {};
        if(!config.subjectRule.test(subject))
            throw new Error('enigma-invalid-input');

        // write subject buf
        subjectBuf =
            tool.get('util.encoding')(subject, 'ascii').toArrayBuffer();

        // generate asymmetric key
        algorithmName = options.algorithm || config.defaultAlgorithmName;
        var algorithm = getDef(algorithmName);
        if(!algorithm){
            algorithmName = defaults.algorithmName;
            algorithm = getDef(algorithmname);
        };

        // choose a secret, if not given, or use the one in option
        if(options.overrideSecret){
            secretBuf = tool.get('hash')(algorithm.secretLength).hash(
                tool.get('util.encoding')(
                    options.overrideSecret
                ).toArrayBuffer()
            ).buffer;
        } else {
            secretBuf = tool.get('util.srand')().bytes(
                algorithm.secretLength
            );
        };
        asymCipher = tool.get('cipher.asymmetric')(algorithm.name);
        asymCipher.setPrivateKey(secretBuf);
        publicKeyBuf = asymCipher.getPublicKey();

        signatureBuf = asymCipher.sign(getID());

        // initialize the instance
        initialize(true);
    };

    function loadIdentityBuf(buf, pinkeyBuf){
        if(!testType(buf).isArrayBuffer())
            throw new Error('enigma-invalid-input');
        if(pinkeyBuf && !testType(pinkeyBuf).isArrayBuffer())
            throw new Error('enigma-invalid-input');

        try{
            var d = serializer.deserialize(buf);
        } catch(e){
            throw new Error('enigma-invalid-input');
        };

        var dSubjectBuf = d['subject'],
            dAlgorithmName = d['algorithm'],
            dSignatureBuf = d['signature'],
            dPublicBuf = d['public'],
            dSecretBuf = d['secret'];

        if(!config.subjectRule.test(
            tool.get('util.encoding')(dSubjectBuf).toASCII()
        ))
            throw new Error('enigma-invalid-input');

        subjectBuf = dSubjectBuf;
        algorithmName = dAlgorithmName;
        signatureBuf = dSignatureBuf;
        publicKeyBuf = dPublicBuf;

        // initialize asymmetric cipher
        asymCipher = tool.get('cipher.asymmetric')(algorithmName);
        if(pinkeyBuf){
            try{
                secretBuf = tool.get('cipher.symmetric')()
                    .key(pinkeyBuf)
                    .decrypt(dSecretBuf)
                ;
            } catch(e){
                throw new Error('enigma-invalid-pinkey');
            };
            asymCipher.setPrivateKey(secretBuf);

            var derivedPublicKey = asymCipher.getPublicKey();
            if(!tool.get('util.buffer').equal(
                derivedPublicKey,
                publicKeyBuf
            ))
                throw new Error('enigma-identity-inconsistent');

        } else {
            asymCipher.setPublicKey(publicKeyBuf);
        };

        // verify public key self signature
        try{
            var selfSigVerify = asymCipher.verify(getID(), signatureBuf);
            if(!selfSigVerify)
                throw new Error('enigma-identity-bad-self-signature');
        } catch(e){
            throw new Error('enigma-identity-bad-self-signature');
        };

        return true;
    };

    this.loadPublic = function(publicIdentityBuf){
        /*
         * Read the public identity
         *  1. read `subjectBuf`, test validity
         *  2. read `publicKeyBuf`, use it to initialize `asymCipher`
         *  3. read `signatureBuf`
         *  4. check signature against subject and publicKey.
         *  5. call `initialize(false)`.
         */
        if(loadIdentityBuf(publicIdentityBuf)) initialize(false);
    };

    this.loadPrivate = function(secretIdentityBuf, pinkeyBuf){
        if(loadIdentityBuf(secretIdentityBuf, pinkeyBuf)) initialize(true);
    };

    this.canLoadPrivate = function(testIdentityBuf){
        if(!testType(testIdentityBuf).isArrayBuffer())
            throw new Error('enigma-invalid-input');

        try{
            var d = serializer.deserialize(testIdentityBuf);
        } catch(e){
            throw new Error('enigma-invalid-input');
        };

        return Boolean(null != d['secret']);
    };

    ////////////////////////// STAGE 2 USAGE ////////////////////////////

    function getSubject(){
        return tool.get('util.encoding')(subjectBuf).toASCII();
    };

    function getAlgorithm(){
        return algorithmName;
    };

    function getFingerprint(useStrFormat){
        var fp = getID().slice(0, 10);
        if(useStrFormat) return tool.get('util.encoding')(fp).toBase32();
        return fp;
    };

    function exportPublic(){
        var ret = serializer.serialize({
            'subject': subjectBuf,
            'algorithm': algorithmName,
            'public': publicKeyBuf,
            'secret': new Uint8Array(0).buffer,
            'signature': signatureBuf,
        });
        return ret;
    };

    function exportPrivate(pinkeyBuf){
        if(!(
            testType(pinkeyBuf).isArrayBuffer() &&
            pinkeyBuf.byteLength >= 32
        ))
            throw new Error('enigma-invalid-pinkey');

        var secretEncryptedBuf = tool.get('cipher.symmetric')()
            .key(pinkeyBuf)
            .encrypt(secretBuf)
        ;

        var ret = serializer.serialize({
            'subject': subjectBuf,
            'algorithm': algorithmName,
            'public': publicKeyBuf,
            'secret': secretEncryptedBuf,
            'signature': signatureBuf,
        });
        return ret;
    };

    function verify(plaintext, signature){
        if(!(
            testType(plaintext).isArrayBuffer() &&
            testType(signature).isArrayBuffer()
        ))
            throw new Error('enigma-invalid-input');

        try{
            return true === asymCipher.verify(plaintext, signature);
        } catch(e){
            return false;
        };
    };

    function sign(plaintext){
        if(!testType(plaintext).isArrayBuffer())
            throw new Error('enigma-invalid-input');

        try{
            return asymCipher.sign(plaintext);
        } catch(e){
            throw new Error('enigma-identity-unable-to-sign');
        };
    };

    function encrypt(plaintext){
        if(!testType(plaintext).isArrayBuffer())
            throw new Error('enigma-invalid-input');

        try{
            return asymCipher.encrypt(plaintext);
        } catch(e){
            throw new Error('enigma-identity-unable-to-encrypt');
        };
    };

    function decrypt(ciphertext){
        if(!testType(ciphertext).isArrayBuffer())
            throw new Error('enigma-invalid-input');

        try{
            return asymCipher.decrypt(ciphertext);
        } catch(e){
            throw new Error('enigma-identity-unable-to-decrypt');
        };
    };

    return this;
};



var exporter = function(){ return new identity(); };
tool.set('enigma.identity', exporter);
tool.exp('enigma.identity', exporter);
//////////////////////////////////////////////////////////////////////////////
})(tool);
