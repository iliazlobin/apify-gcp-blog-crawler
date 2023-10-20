import Apify, { Actor } from 'apify';
import { createPuppeteerRouter } from 'crawlee';

export const router = createPuppeteerRouter();

router.addDefaultHandler(async ({ page, log, enqueueLinks }) => {
    log.info(`processing the page in the default handler: ${page.url()}`);

    let {
        paginationLimit = 5,
    } = await Actor.getInput<{
        paginationLimit?: number
    }>() || {};
    log.info(`inputs:
        paginationLimit: ${paginationLimit}
    `);

    log.info(`paginating ${paginationLimit} times`);
    for (let i = 0; i < paginationLimit; i++) {

        const cards = await page.$$eval('a[track-type="articlefeedblock"]', () => '');
        log.debug(`Number of cards detected: ${cards.length}`);

        try {
            await page.waitForSelector('button[track-metadata-module="recent articles"]');
            await page.click('button[track-metadata-module="recent articles"]');
        } catch (e) {
            log.error(`error clicking on the "more" button: ${e}`);
            break;
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    log.info(`parsing all cards`);
    const cards = await page.$$eval('a[track-type="articlefeedblock"]', (els) => {
        const items: any[] = [];

        for (const el of els) {
            const url = el.getAttribute('href') ?? '';
            const tag = el.querySelector('div[track-type="tag"]')?.textContent ?? '';
            const title = el.parentNode?.querySelector('h5')?.textContent ?? '';
            const authorText = el.parentNode?.querySelector('p')?.textContent ?? '';
            const authorRegex = /By (\w+\s\w+)/;
            const authorMatch = authorText.match(authorRegex);
            const author = authorMatch ? authorMatch[1] : '';

            items.push({
                url,
                tag,
                title,
                author,
            });
        }

        return items;
    });

    log.info(`enqueuing ${cards.length} cards`);
    for (const card of cards) {
        log.debug(`enqueueing url: ${card.url}, ${card.title}`);

        await enqueueLinks({
            urls: [card.url],
            label: 'article',
            userData: {
                title: card.title,
                author: card.author,
                tag: card.tag,
            },
        });
    }
});

router.addHandler('article', async ({ request, page, log }) => {
    const pageTitle = await page.title();
    const data = request.userData;

    log.info(`processing the page in the article handler: ${page.url()}, ${pageTitle}`);

    const tag = await page.$eval('div[track-type="tag"]', (el) => el.textContent) ?? '';
    const title = await page.$eval('div[track-type="tag"]', (el) => el.parentNode?.querySelector('h1')?.textContent) ?? '';
    const dateText = await page.$eval('div[track-type="tag"]', (el) => el.parentNode?.childNodes[2].textContent) ?? '';

    const authors = await page.$eval('div[track-type="tag"]', (el) => {
        const node = el.parentNode?.parentNode?.parentNode?.querySelector('h5')?.parentNode?.parentNode;
        const nameNodes = node?.querySelectorAll('h5');
        const authors: any[] = [];

        for (const nameNode of nameNodes ?? []) {
            const name = nameNode.textContent ?? '';
            const jobTitle = nameNode.parentNode?.querySelector('p')?.textContent ?? '';
            authors.push({
                name,
                jobTitle,
            });
        }

        return authors;
    }) ?? '';

    const text = await page.$eval('div[track-type="tag"]', (el) => el.parentNode?.parentNode?.parentNode?.querySelector('span[data-track-type]')?.parentNode?.parentNode?.textContent) ?? '';
    const date = new Date(dateText);

    await Apify.Dataset.pushData({
        title: title,
        url: request.loadedUrl,
        authors: authors,
        date: date,
        tag: tag,
        text: text,
    });
});
