import { Actor } from 'apify';
import { PuppeteerCrawler } from 'crawlee';
import { router } from './routes.js';

await Actor.init();

// https://cloud.google.com/blog/topics/inside-google-cloud/complete-list-google-cloud-blog-links-2021
const startUrls = [
    // 'https://cloud.google.com/blog/products/ai-machine-learning',
    'https://cloud.google.com/blog/products/cloud-migration',
];

const proxyConfiguration = await Actor.createProxyConfiguration();

const {
    maxRequestsPerMinute = 5,
    maxRequestRetries = 10,
    requestHandlerTimeoutSecs = 1800,
} = await Actor.getInput<{
    maxRequestsPerMinute?: number,
    maxRequestRetries?: number,
    requestHandlerTimeoutSecs?: number
}>() || {};

const crawler = new PuppeteerCrawler({
    proxyConfiguration,
    requestHandler: router,
    maxRequestsPerMinute,
    maxRequestRetries,
    requestHandlerTimeoutSecs,
    // useSessionPool: false,
    retryOnBlocked: true,
    launchContext: {
        useChrome: true,
        launchOptions: {
            executablePath: '/root/apps/chromium/linux-1211267/chrome-linux/chrome',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
    },
});

await crawler.run(startUrls);

await Actor.exit();
