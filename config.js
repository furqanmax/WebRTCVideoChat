const config = {
    local: {
      httpPort: 8000,
      wsPort: 3333,
      hostname: 'localhost',
      secure: false,
    },
    production: {
      httpPort: 443,
      wsPort: 443,
      hostname: 'your-production-domain.com',
      secure: true,
    },
  };
  
  const ENV = process.env.NODE_ENV || 'local';
  
  module.exports = config[ENV];
  