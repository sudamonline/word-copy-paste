import axios from "axios";

const BASE_URL = "https://stg.api.insightsterminal.com/api";

export default axios.create({
	baseURL: BASE_URL,
	headers: {
		"Content-Type": "application/json",
	},
});
