import {createHash,createHmac,createPublicKey,verify} from 'node:crypto';

export async function enrollDevice(repository,request,input,{pairingPepper,now=new Date()}={}){
  if(!pairingPepper||pairingPepper.length<32)throw new Error('Pairing pepper is not configured');
  if(input?.serial!==request.serial||!/^[A-Za-z0-9._:-]{1,128}$/.test(input?.serial??''))throw new Error('Invalid serial');
  if(!/^[A-Z0-9]{12}$/.test(input?.pairing_code??''))throw new Error('Invalid pairing code');
  if(!/^com\.gimml\.terminal(?:\.debug)?$/.test(input?.application_id??''))throw new Error('Invalid application identity');
  if(!/^[a-f0-9]{64}$/.test(input?.signing_certificate_sha256??''))throw new Error('Invalid signing certificate identity');
  if(typeof input?.public_key_der_base64!=='string'||typeof input?.key_fingerprint!=='string')throw new Error('Public key is required');
  const der=Buffer.from(input.public_key_der_base64,'base64');if(der.length<64||der.length>1024)throw new Error('Invalid public key');
  const fingerprint=createHash('sha256').update(der).digest('base64url');if(fingerprint!==input.key_fingerprint)throw new Error('Key fingerprint mismatch');
  const publicKey=createPublicKey({key:der,format:'der',type:'spki'});if(publicKey.asymmetricKeyType!=='ec'||publicKey.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw new Error('P-256 key required');
  if(!verify('sha256',request.canonical,publicKey,Buffer.from(request.signature,'base64')))throw new Error('Invalid enrollment signature');
  const digest=createHmac('sha256',pairingPepper).update(`${input.serial}\n${input.pairing_code}`).digest();
  const device=await repository.consumePairingCodeAndEnroll({serial:input.serial,codeDigest:digest,applicationId:input.application_id,signingCertificateSha256:Buffer.from(input.signing_certificate_sha256,'hex'),publicKeyDer:der,keyFingerprint:fingerprint,now});
  if(!device)throw new Error('Pairing code is invalid or expired');return device;
}
