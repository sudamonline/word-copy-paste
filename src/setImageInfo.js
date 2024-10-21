export function setImageInfo(imageInfo, file) {
  const { key, AWSAccessKeyId, policy, signature } =
    imageInfo.presigned_url.fields;
  const url = imageInfo.presigned_url.url;

  const formData = new FormData();
  formData.append("key", key);
  formData.append("AWSAccesskeyId", AWSAccessKeyId);
  formData.append("policy", policy);
  formData.append("signature", signature);
  formData.append("file", file);

  return {
    payload: formData,
    imageUrl: url + key,
  };
}
