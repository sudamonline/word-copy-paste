import axios from "./axios";

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
  const uploadImage = async (payload) => {
    console.log("https://insights-terminal.s3.amazonaws.com", "env");
    return axios.post(
      `${"https://insights-terminal.s3.amazonaws.com"}`,
      payload
    );
  };

  return {
    generateUrl,
    uploadImage,
  };
};

export default useImageApi;
