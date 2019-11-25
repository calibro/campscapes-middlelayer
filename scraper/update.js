const fs = require("fs");
const path = require("path");
const colors = require("colors/safe");
const program = require("commander");
const api = require("./api");
const keyBy = require("lodash/keyBy");
const get = require("lodash/get");
const sortBy = require("lodash/sortBy");
const tail = require("lodash/tail");
const flatten = require("lodash/flatten");
const findIndex = require("lodash/findIndex");
const find = require("lodash/find");
const uniq = require("lodash/uniq");

const CAMPSCAPES_DATA_DIRNAME = "campscapes-data";

async function main(options) {
  console.log("# Campscapes data parser");

  console.log("Options:", options);

  const targetDir = path.resolve(
    path.join(options.targetDir, CAMPSCAPES_DATA_DIRNAME)
  );

  //creating subdir
  try {
    if (!fs.statSync(targetDir).isDirectory()) {
      console.error(
        colors.red(`${CAMPSCAPES_DATA_DIRNAME} exists and it's not a directory`)
      );
      process.exit(1);
    } else {
      console.log(
        colors.yellow(`Target directory "${CAMPSCAPES_DATA_DIRNAME}" existing`)
      );
    }
  } catch (e) {
    console.log(
      colors.yellow(`Creating target directory "${CAMPSCAPES_DATA_DIRNAME}"`)
    );
    fs.mkdirSync(targetDir);
  }

  //getting all items
  console.log(colors.yellow(`Getting items`));
  let allItems;
  const allItemsFilename = path.join(targetDir, "allItems.json");
  if (!options.downloadItems) {
    const allItemsData = fs.readFileSync(allItemsFilename);
    allItems = JSON.parse(allItemsData);
  } else {
    allItems = await api.getItemsGreedy({
      query: { per_page: options.perPage },
      greedy: true
    });
    allItems = await api.addFilesToItems(allItems)
    fs.writeFileSync(allItemsFilename, JSON.stringify(allItems));
  }

  const allItemsById = keyBy(allItems, "id");

  //getting all files
  const allFiles = await api.getFiles();
  const allFilesById = keyBy(allFiles, "id");

  //getting relations
  console.log(colors.yellow(`Getting relations`));
  const relations = await api.getItemRelations();
  const relationsFilename = path.join(targetDir, "relations.json");
  fs.writeFileSync(relationsFilename, JSON.stringify(relations));

  console.log(colors.yellow(`Getting camps`));
  const rawCamps = allItems.filter(item => item.item_type === "site");
  let camps = await Promise.all(
    rawCamps.map(async function(camp) {
      return await api.enrichWithRelations(camp, relations, allItemsById);
    })
  );
  const campsFilename = path.join(targetDir, "camps.json");

  //getting themes (tags)
  console.log(colors.yellow(`Getting themes`));
  const themes = await api.getTags();
  const themesFilename = path.join(targetDir, "themes.json");
  fs.writeFileSync(themesFilename, JSON.stringify(themes));

  //camps network: tbd
  const campsNetworksFilename = path.join(targetDir, "campsNetworks.json");
  fs.writeFileSync(campsNetworksFilename, JSON.stringify(camps));

  //getting icons
  console.log(colors.yellow(`Getting icons`));
  const rawIcons = allItems.filter(item => item.item_type === "icon");
  let icons = await Promise.all(
    rawIcons.map(async function(icon) {
      return await api.enrichWithRelations(icon, relations, allItemsById, true);
    })
  );
  const iconsFilename = path.join(targetDir, "icons.json");

  console.log(colors.yellow(`Getting stories`));
  let allPages = await api.getPages();
  const allExhibits = await api.getExhibits();
  const allExhibitsById = keyBy(allExhibits, "id");

  const allPagesWithAttachments = allPages.map(page =>
    api.addPageAttachments(page, allItemsById, allFilesById)
  );
  const allPagesWithAttachmentsById = keyBy(allPagesWithAttachments, "id");

  //fixing items and icons now that we have pages with attachments
  const addRelatedPagesToItem = item => {
    //finding all pages with this item in attachment
    const linkedPages = allPagesWithAttachments.filter(page => {
      const attachs = get(page, "page_blocks[0].attachments");
      return (
        findIndex(
          attachs,
          attachment => get(attachment, "item.id") === item.id
        ) !== -1
      );
    });
    item.linkedPages = linkedPages
      .map(linkedPage => {
        const extendedResourceId = get(linkedPage, "id");
        if (!extendedResourceId) {
          return undefined;
        }
        const paragraph = get(allPagesWithAttachmentsById, extendedResourceId);
        if (paragraph && paragraph.exhibit) {
          const exhibit = get(allExhibitsById, paragraph.exhibit.id);
          return (
            exhibit && {
              paragraph: paragraph.order,
              exhibitId: exhibit.id,
              exhibitSlug: exhibit.slug,
              exhibitTitle: exhibit.title
            }
          );
        }
      })
      .filter(x => x !== undefined);

    return item;
  };
  allItems = allItems.map(addRelatedPagesToItem);
  fs.writeFileSync(allItemsFilename, JSON.stringify(allItems));

  icons = icons.map(addRelatedPagesToItem);
  fs.writeFileSync(iconsFilename, JSON.stringify(icons));

  camps = camps.map(addRelatedPagesToItem);
  // we wait to write camps, we still need to add networks

  const allStories = allExhibits.map(exhibit => {
    let pagesWithAttachments = allPagesWithAttachments.filter(
      page => get(page, "exhibit.id") === exhibit.id
    );
    pagesWithAttachments = sortBy(pagesWithAttachments, page => page.order);
    // the first page is used for linking a camp to a story (first attachment of first page)
    if (pagesWithAttachments.length > 0) {
      if (!exhibit.featured) {
        const firstPage = pagesWithAttachments[0];
        exhibit.camp = get(
          firstPage,
          "page_blocks[0].attachments[0].item",
          null
        );
        if (firstPage.page_blocks && firstPage.page_blocks.length > 1) {
          firstPage.page_blocks = [firstPage.page_blocks[1]];
          exhibit.pages = pagesWithAttachments;
        } else {
          exhibit.pages = tail(pagesWithAttachments);
        }
      } else {
        //we still discard the first page as it contains background images for home page 
        // exhibit.pages = pagesWithAttachments;
        exhibit.pages = tail(pagesWithAttachments);
      }
    } else {
      exhibit.pages = [];
      exhibit.camp = null;
    }

    const tags = exhibit.credits ? exhibit.credits.split(",") : [];
    exhibit.tags = tags.map(tag => tag.trim());
    return exhibit;
  });

  //creating home page images file
  const homeImagesFilename = path.join(targetDir, "homeImages.json");
  let homeImages = []
  const featuredExhibit = find(allExhibits, item => item.featured === true)
  if(featuredExhibit){
    let pagesWithAttachments = allPagesWithAttachments.filter(
      page => get(page, "exhibit.id") === featuredExhibit.id
    );
    if(pagesWithAttachments.length){
      const firstPage = pagesWithAttachments[0];
      const pageBlocks = get(firstPage, 'page_blocks', [])
      homeImages = flatten(pageBlocks.map(b => get(b, 'attachments', [])))
    }
  }
  homeImages = homeImages.map(homeImage => {
    const file = get(homeImage, "file")
    const item = get(homeImage, "item")
    if(!file){
      return null
    }
    return {
      ...file,
      item
    }
  }).filter(item => !!item)
  fs.writeFileSync(homeImagesFilename, JSON.stringify(homeImages));
  
  // stories writing
  // adding "creator" field with creators of all attachments
  let stories = allStories.filter(item => !item.featured);
  stories = stories.map(story => {
    const pages = get(story, 'pages', [])
    const creator = pages.reduce((creators, page, idx) => {
      const blocks = get(page, 'page_blocks', [])
      let pageAttachments =  flatten(blocks.map(block => get(block, 'attachments', [])))
      let attachmentsCreators = flatten(pageAttachments.map(attachment => get(attachment, 'item.data.creator', [])))
      return creators.concat(attachmentsCreators)
    }, [])
    return {
      ...story,
      creator: uniq(creator),
    }
  })
  
  const storiesFilename = path.join(targetDir, "stories.json");
  fs.writeFileSync(storiesFilename, JSON.stringify(stories));

  const featStories = allStories.filter(item => item.featured);
  let introSteps = [];
  if (featStories.length) {
    const intro = featStories[0];
    introSteps = get(intro, "pages", []).map(page =>
      get(page, "page_blocks[0].text")
    );
  }
  const introStepsFilename = path.join(targetDir, "introSteps.json");
  fs.writeFileSync(introStepsFilename, JSON.stringify(introSteps));

  console.log(colors.yellow(`Getting simple pages`));

  const simplePages = await api.getSimplePages();
  const simplePagesFilename = path.join(targetDir, "simplePages.json");
  fs.writeFileSync(simplePagesFilename, JSON.stringify(simplePages));

  const addNetworkToCamp = camp => {
    const nodesById = {};
    const links = [];

    camp.linkedPages.map(page => {
      const story = find(allStories, s => s.slug === page.exhibitSlug);
      if (story) {
        if (!nodesById[story.id]) {
          nodesById[story.id] = {
            id: story.id,
            slug: story.slug,
            title: story.title,
            itemType: "story"
          };
        }
        get(story, "pages", []).map(currentPage => {
          get(currentPage, "page_blocks", []).forEach(pageBlock => {
            pageBlock.attachments.forEach(attach => {
              if (attach.item) {
                
                if (!nodesById[attach.item.id]) {
                  nodesById[attach.item.id] = {
                    id: attach.item.id,
                    itemType: attach.item.item_type,
                    title: attach.item.data.title,
                    fileUrls: get(attach.item, "data.files[0].file_urls")
                  };
                }
                links.push({
                  source: story.id,
                  target: attach.item.id,
                  paragraph: page.paragraph + 1
                });
              }
            });
          });
        });
      }
    });
    const nodes = Object.values(nodesById);
    const storiesNetwork = {
      links,
      nodes
    };

    return {
      ...camp,
      storiesNetwork
    };
  };
  // getting networks for each camps
  const campsWithNetworks = camps.map(camp =>
    addNetworkToCamp(camp, allItemsById, allStories)
  );
  fs.writeFileSync(campsFilename, JSON.stringify(campsWithNetworks));
}

function myParseInt(value, dummyPrevious) {
  // parseInt takes a string and an optional radix
  return parseInt(value);
}

if (require.main === module) {
  program
    .version("0.1.0")
    .option(
      "-d, --dir <directory>",
      `Output directory. A subdir "${CAMPSCAPES_DATA_DIRNAME}" will be created if not exisiting`
    )
    .option('--pagesize <number>', 'Items per page', myParseInt)
    .option("--no-items", "use existing items")
    .parse(process.argv);

  const inputOption = program.dir || process.argv[2];

  let targetDir;
  try {
    if (fs.statSync(inputOption).isDirectory()) {
      targetDir = inputOption;
    }
  } catch (e) {
    console.error(colors.red("Please specify a valid report directory."));
    process.exit(1);
  }
  
  main(
    {
      targetDir,
      downloadItems: program.items,
      perPage: program.pagesize || 50,
    },
    console,
    colors
  );
} else {
  module.exports = main;
}
