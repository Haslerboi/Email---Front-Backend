# Railway Deployment Guide - Email Assistant v2.0

## 🚀 Railway Deployment Setup

This guide will help you deploy the new Email Assistant categorization system to Railway.

## 📋 Required Environment Variables

Set these environment variables in your Railway project (replace with your actual values):

### Gmail API Configuration
```
GMAIL_CLIENT_ID=your-gmail-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-gmail-client-secret
GMAIL_REFRESH_TOKEN=your-gmail-refresh-token
GMAIL_REDIRECT_URI=https://your-railway-domain.railway.app/auth/google/callback
```

### AI API Keys
```
OPENAI_API_KEY=your-openai-api-key
GEMINI_API_KEY=your-gemini-api-key
```

### Optional Configuration
```
NODE_ENV=production
GMAIL_CHECK_INTERVAL_MS=60000
GMAIL_INITIAL_DELAY_MS=30000
```

## 🔑 Where to Get API Keys

### Gmail API Credentials
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Gmail API
4. Create OAuth 2.0 credentials
5. Use the existing credentials from your setup

### OpenAI API Key
1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create a new API key
3. Use your existing key from previous setup

### Gemini API Key
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a new API key
3. Copy the key for Railway environment variables

## 🛠️ Deployment Steps

### 1. Prepare Railway Project
1. Go to [railway.app](https://railway.app)
2. Connect your GitHub repository
3. Select the `email-assistant-backend` directory as the root

### 2. Set Environment Variables
1. In Railway dashboard, go to your service
2. Click on the **Variables** tab
3. Add all the environment variables listed above
4. **IMPORTANT**: Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

### 3. Configure Deployment
Railway will automatically:
- Use port 8080 (configured in the app)
- Run `npm start` as the start command
- Use the health check at `/api/status`

### 4. Verify Deployment
After deployment, check these endpoints:
- `https://your-app.railway.app/api/` - Welcome message
- `https://your-app.railway.app/api/status` - System status
- `https://your-app.railway.app/api/whitelist` - Whitelist management

## 🔧 System Features (v2.0)

### Email Categories
- **Draft Email**: Automatic reply generation for business emails
- **Invoices**: Auto-filed to "Invoices" label
- **Spam**: Auto-moved to "Email Prison" label  
- **Whitelisted Spam**: Marked as read, stays in inbox

### Workflows
- **Gmail Polling**: Every 60 seconds for new emails
- **Whitelist Learning**: Checks "white" label every 2 minutes
- **AI Processing**: OpenAI GPT-5-mini (triage) + OpenAI GPT-5 (drafting)

## 🔍 Troubleshooting

### Common Issues

1. **"Gemini API key not found"**
   - Add `GEMINI_API_KEY` environment variable
   - Get key from Google AI Studio

2. **Gmail label creation failures**
   - Check Gmail API quotas
   - Verify refresh token is valid

3. **Port issues**
   - Railway automatically uses port 8080
   - Don't set PORT manually unless needed

### Health Checking
```bash
# Check if service is running
curl https://your-app.railway.app/api/status

# Check environment configuration
npm run check-env
```

### Logs
View logs in Railway dashboard under **Deployments** tab for debugging.

## 📊 Monitoring

Monitor these metrics:
- Email processing rate
- AI API response times  
- Gmail API quota usage
- Whitelist growth

## 🔄 Updates

To deploy updates:
1. Push changes to your repository
2. Railway will automatically redeploy
3. Check `/api/status` to verify new version

## 🆘 Support

If you encounter issues:
1. Check Railway logs
2. Verify all environment variables are set
3. Test Gmail and AI API connectivity
4. Review the system status endpoint 