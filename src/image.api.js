import axios from "./axios";
import publicAxios from "axios";

const useImageApi = () => {
  /**
   * Update user info
   * @param payload
   */
  const generateUrl = async (payload) => {
    const { data } = await axios.post(`/assets/gen-presigned`, {
      assets: payload,
    });
    return data.assets;
  };

  /**
   * Upload Image
   * @param payload
   */
  const uploadImage = async (url, payload) => {
    console.log("url [hook]", url);
    return publicAxios.post(url, payload);
  };

  return {
    generateUrl,
    uploadImage,
  };
};

export default useImageApi;
