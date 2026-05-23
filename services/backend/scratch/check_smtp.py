import asyncio
import aiosmtplib

async def main():
    print("Connecting to smtp.gmail.com on port 587...")
    smtp = aiosmtplib.SMTP(hostname='smtp.gmail.com', port=587)
    print("Initial use_tls:", smtp.use_tls)
    await smtp.connect()
    print("TCP connection established.")
    print("Post-connect use_tls:", smtp.use_tls)
    
    try:
        print("Initiating STARTTLS...")
        await smtp.starttls()
        print("STARTTLS handshake completed successfully!")
    except Exception as e:
        print("STARTTLS failed:", e)
        
    await smtp.quit()
    print("Connection closed cleanly.")

if __name__ == '__main__':
    asyncio.run(main())
