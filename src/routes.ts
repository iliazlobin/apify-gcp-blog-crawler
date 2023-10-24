import Apify, { Actor } from 'apify';
import { createPuppeteerRouter } from 'crawlee';

export const router = createPuppeteerRouter();

router.addDefaultHandler(async ({ page, log, enqueueLinks }) => {
    const url = page.url() ?? '';
    log.info(`processing default page: ${url}`);

    let {
        lookBackWindow = 0,
        paginationLimit = 1,
        pageItemsLimit = 3,
    } = await Actor.getInput<{
        lookBackWindow?: number,
        paginationLimit?: number
        pageItemsLimit?: number
    }>() || {};
    log.debug(`inputs: lookBackWindow=${lookBackWindow}, paginationLimit=${paginationLimit}, pageItemsLimit=${pageItemsLimit}`);

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

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const startOfTodayText = startOfToday.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    const targetDate = new Date(startOfToday.getTime() - lookBackWindow * 24 * 60 * 60 * 1000);
    const targetDateText = targetDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

    const limitedCards: any[] = [];
    if (pageItemsLimit > 0) {
        log.info(`limiting cards: ${pageItemsLimit} out of ${cards.length}`);
        for (let i = 0; i < pageItemsLimit; i++) {
            limitedCards.push(cards[i]);
        }
    } else {
        limitedCards.push(...cards);
    }

    log.info(`enqueuing ${limitedCards.length} cards`);
    for (const card of limitedCards) {
        log.debug(`enqueueing url: ${card.url} ${card.title}`);

        await enqueueLinks({
            urls: [card.url],
            label: 'article',
            userData: {
                title: card.title,
                author: card.author,
                tag: card.tag,
                targetDateText: targetDateText,
            },
        });
    }
});

router.addHandler('article', async ({ request, page, log }) => {
    const url = request.loadedUrl ?? '';
    const pageTitle = await page.title();
    const data = request.userData;

    const dateTag = await page.$eval('div[track-type="tag"]', (el) => el.parentNode?.childNodes[2].textContent) ?? '';
    const date = new Date(dateTag);
    const dateText = date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

    log.debug(`parsing page (${dateText}): ${url} ${pageTitle}`);

    const targetDateText = data.targetDateText;
    const targetDate = new Date(targetDateText)

    if (date < targetDate) {
        log.debug(`skipping article: (${dateText} < ${targetDateText}): ${url} ${pageTitle}`);
        return;
    }

    const tag = await page.$eval('div[track-type="tag"]', (el) => el.textContent) ?? '';
    const title = await page.$eval('div[track-type="tag"]', (el) => el.parentNode?.querySelector('h1')?.textContent) ?? '';

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

    log.info(`saving page (${dateText}): ${url} ${title}`);

    await Apify.Dataset.pushData({
        title: title,
        url: url,
        authors: authors,
        date: date,
        tag: tag,
        text: text,
    });
});
