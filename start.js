const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const axios = require('axios');
const dns = require('dns').promises; 
const { URL } = require('url'); 
const app = express();


app.use(express.static(path.join(__dirname, '/')));


app.use(bodyParser.json());

// Define the port
const PORT = process.env.PORT || 3000;


const parseUrl = (inputUrl) => {
    try {
        const url = new URL(inputUrl);
        const hostname = url.hostname;  
        const protocol = url.protocol;
        const path = url.pathname;
        const searchParams = url.search;
        
        return {
            success: true,
            parsedUrl: {
                protocol: protocol,
                hostname: hostname,
                path: path,
                search: searchParams
            }
        };
    } catch (error) {
        return { success: false, message: 'Invalid URL format' };
    }
};


const getDnsRecords = async (hostname) => {
    try {
        const aRecords = await dns.resolve4(hostname); 
        const aaaRecords = await dns.resolve6(hostname); 
        const mxRecords = await dns.resolveMx(hostname); 

        return {
            aRecords: aRecords.length ? aRecords : ['No A records found'],
            aaaRecords: aaaRecords.length ? aaaRecords : ['No AAAA records found'],
            mxRecords: mxRecords.length ? mxRecords.map(record => record.exchange) : ['No MX records found'],
        };
    } catch (error) {
        return {
            error: 'DNS records could not be fetched',
            details: error.message
        };
    }
};


const getSubdomains = async (hostname) => {
    try {
        
        const response = await axios.get(`https://api.hackertarget.com/hostsearch/?q=${hostname}`);
        

        const subdomains = response.data.split('\n').slice(1).map(line => {
            const columns = line.split(',');
            return columns[0]; 
        });


        return {
            success: true,
            subdomains: subdomains.filter(subdomain => subdomain)
        };
    } catch (error) {
        console.error('Error during subdomain lookup:', error.message);
        return {
            success: false,
            message: 'Unable to fetch subdomains'
        };
    }
};


const handleCommand = async (command) => {
    const commandParts = command.split(' ');

   
    if (command === '/help') {
        return {
            success: true,
            message: `
                <b>Available Commands:</b><br><br>
                <b>/lookup [url]</b> - Get details of your target (URL, domains, IPs supported)<br>
                <b>/getsub [domain]</b> - Get subdomains of a domain or full URL<br>
                <i>Usage:</i> /lookup https://example.com, /getsub example.com or /getsub https://example.com
            `
        };
    }

    
    if (command.startsWith('/lookup')) {
        if (commandParts.length < 2) {
            return { success: false, message: '/lookup [url] - Please provide a URL to lookup.' };
        }

        const url = commandParts[1];
        const parsed = parseUrl(url);

        if (!parsed.success) {
            return { success: false, message: parsed.message };
        }

        const { hostname } = parsed.parsedUrl;

        try {
            const address = await dns.lookup(hostname);
            const response = await axios.get(`https://ipinfo.io/${address.address}/json`);
            const ipDetails = response.data;

            const dnsRecords = await getDnsRecords(hostname);

            return {
                success: true,
                message: `
                    🧑‍💻 Full Lookup Details for: ${url} <br><br>
                    <b>Protocol:</b> ${parsed.parsedUrl.protocol} <br>
                    <b>Host:</b> ${hostname} <br>
                    <b>Path:</b> ${parsed.parsedUrl.path} <br>
                    <b>Search Params:</b> ${parsed.parsedUrl.search || 'None'} <br>
                    <b>IP Address:</b> ${ipDetails.ip} <br>
                    <b>Location:</b> ${ipDetails.city}, ${ipDetails.region}, ${ipDetails.country} <br>
                    <b>DNS Records:</b> <br>
                    <b>A Records:</b> ${dnsRecords.aRecords.join(', ')} <br>
                    <b>AAAA Records:</b> ${dnsRecords.aaaRecords.join(', ')} <br>
                    <b>MX Records:</b> ${dnsRecords.mxRecords.join(', ')} <br>
                `
            };
        } catch (error) {
            console.error('Error during DNS lookup or ipinfo.io request:', error.message);
            return {
                success: false,
                message: `⚠️ Error during lookup for URL: ${url}. ${error.message}`
            };
        }
    }


    if (command.startsWith('/getsub')) {
        if (commandParts.length < 2) {
            return { success: false, message: '/getsub [domain] - Please provide a domain or URL to lookup.' };
        }

        let domain = commandParts[1];


        if (domain.startsWith('http://') || domain.startsWith('https://')) {
          
            const parsedUrl = parseUrl(domain);
            if (!parsedUrl.success) {
                return { success: false, message: parsedUrl.message };
            }
            domain = parsedUrl.parsedUrl.hostname; 
        }

        
        const subdomains = await getSubdomains(domain);

        if (subdomains.success) {
            return {
                success: true,
                message: `
                    <b>Subdomains for ${domain}:</b><br>
                    ${subdomains.subdomains.length > 0 ? subdomains.subdomains.join('<br>') : 'No subdomains found.'}
                `
            };
        } else {
            return {
                success: false,
                message: subdomains.message
            };
        }
    }

    
    return {
        success: false,
        message: '⚠️ Command not recognized. Type /help for available command.'
    };
};


app.post('/execute-command', async (req, res) => {
    const { command } = req.body;

    if (!command) {
        return res.status(400).json({ success: false, message: 'No command provided.' });
    }

    const result = await handleCommand(command);

    res.json(result); 
});


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
