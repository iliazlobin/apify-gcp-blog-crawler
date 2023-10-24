import { Actor } from 'apify';
import { PuppeteerCrawler } from 'crawlee';
import { router } from './routes.js';

await Actor.init();

const proxyConfiguration = await Actor.createProxyConfiguration();

// https://cloud.google.com/blog/topics/inside-google-cloud/complete-list-google-cloud-blog-links-2021
const defaultUrls = [
    'https://cloud.google.com/blog/products/ai-machine-learning',
    'https://cloud.google.com/blog/products/cloud-migration',
];

const {
    maxRequestsPerMinute = 5,
    maxRequestRetries = 5,
    requestHandlerTimeoutSecs = 600,
    urls = defaultUrls,
} = await Actor.getInput<{
    maxRequestsPerMinute?: number,
    maxRequestRetries?: number,
    requestHandlerTimeoutSecs?: number
    urls?: string[],
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

await crawler.run(urls);

await Actor.exit();
