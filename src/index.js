export default {
  async fetch(request, env) {
    // Capai servis di server Ubuntu melalui tunnel
    const response = await env.PRIVATE_NETWORK.fetch("http://10.0.0.5:8080/api");
    const data = await response.text();
    return new Response(data);
  },

  async email(message, env) {
    await message.forward("fevianbenjo48@gmail.com");
  }
};
