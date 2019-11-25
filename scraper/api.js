const BASE_URL = 'http://www.dbportal.ic-access.specs-lab.com/api'
const API_KEY = 'dd9451bfd7f887f996e82d88677336abd9c910ab'
const request = require('superagent')
const queryString = require('query-string');
const get = require('lodash/get')
const keyBy = require('lodash/keyBy')
const groupBy = require('lodash/groupBy')
const camelcase = require('camelcase')
const chunk = require('lodash/chunk')
const head = require('lodash/head')
// `http://www.dbportal.ic-access.specs-lab.com/api/items?key=dd9451bfd7f887f996e82d88677336abd9c910ab`



const FIELDS_TO_TYPES = {
  'latitude': Number,
  'longitude': Number,
  // ...
}

const ARRAY_FIELDS = ["creator", "externalUrl"]


async function simplifyItem(item){
  const elementTexts = get(item, 'element_texts', [])

  let data = {}

  elementTexts.forEach(elementText => {
    const name = camelcase(elementText.element.name)
    const mapping  = get(FIELDS_TO_TYPES, name, x => x)
    const value = mapping(elementText.text)
    if(ARRAY_FIELDS.indexOf(name) !== -1){
      const arrayValue = value.split(",")
      if(!data[name]){
        data[name] = []
      }
      data[name] = data[name].concat(arrayValue)
    } else {
      data[name] = value
    }
  });
  
  return {
    ...item,
    element_texts: undefined,
    item_type: get(item, 'item_type.name'),
    data
  }
}


async function addFilesToItems(items){

  const itemsGroups = chunk(items, 10)
  let out = []
  for (const [idx, itemGroup] of itemsGroups.entries()) {
    console.log(`Getting files for items ${idx*10}-${(idx+1)*10} of ${items.length}`)
    const g = await Promise.all(itemGroup.map(async function(item){
      if(item.files){
        item.data.files = await getUrlFromApiResponse(item.files.url)
        
      }
      return item
    }))
    // console.log("g", g)
    out = out.concat(g)
    
  }
  return out

  //# NOT-CHUNKED VERSION
  // for (const [idx, item] of items.entries()) {
  //   console.log("idx", idx)
  //   if(item.files){
  //     item.data.files = await getUrlFromApiResponse(item.files.url)
  //     console.log("W!", item.data.files)
  //   }
  // }
  return items

}



async function enrichWithRelations(item, relations, itemsById, withSubjects=false){
  
  // TODO: understand if we should use this, object_item_id or both
  const subjectRelations = relations.filter(relation => relation.subject_item_id === item.id)
  const objectRelations = relations.filter(relation => relation.object_item_id === item.id)
  
  const objects = await Promise.all(objectRelations.map(async function(relation){
    // return await getItem(relation.subject_item_id)
    return get(itemsById, relation.subject_item_id)
  }))

  const objectsByType = groupBy(objects, 'item_type')
  
  let subjectsByType
  if(withSubjects){
    const subjects = await Promise.all(subjectRelations.map(async function(relation){
      // return await getItem(relation.object_item_id)
      return get(itemsById, relation.object_item_id)
    }))
    subjectsByType = groupBy(subjects, 'item_type')
  }
  
  
  
  return {
    ...item,
    relations: {
      ...objectsByType,
      // objects, 
      // subjects,
    },
    subjectsRelations: {
      ...subjectsByType
    }
    
  }
}


function greedyAPIMaker(apFn){

  return async function innerCallable(options = {
    query: { },
    greedy: true,
    relations: [],
    allItems: [],
  }) {
    let out = []
    const query = options.query || {}
    const page = query.page || 1

    const itemsById = keyBy(options.allItems, 'id')

    try {
      const pageData = await apFn(options.query)
      const lastUrlAndQuery = queryString.parseUrl(pageData.links.last)
      const lastPage = lastUrlAndQuery.query.page
      let itemsList = await Promise.all(pageData.body.map(simplifyItem))

      if(options.relations && options.relations.length) {
        itemsList= await Promise.all(
          itemsList.map(async function(item){
            return await enrichWithRelations(item, options.relations, itemsById)
          })
        )
      }
      out = out.concat(itemsList)
  
      if(options.greedy && page < lastPage){
        const nextPage = await innerCallable({ ...options, query: { ...options.query, page: page+1}})
        out = out.concat(nextPage)
      }
  
    } catch (err) {
      throw(err)
    }
    
    return out
    
  }
}


async function getUrlFromApiResponse(url) {
  const urlAndQuery = queryString.parseUrl(url)
  try {
    var response = await request
    .get(urlAndQuery.url)
    .query({...urlAndQuery.query, key: API_KEY})
    .then(({body}) => body)
  } catch (err) {
    throw(err)
  }
  return response
}


async function getItem(id) {
  try {
    var response = await request
    .get(`${BASE_URL}/items/${id}`)
    .query({key: API_KEY})
    .then(async function(resp){
      return await simplifyItem(resp.body)
    })
  //  
  } catch (err) {
    // do something with err...
  }
  return response
}
 

async function getItems(q={}) {
  try {
    console.log("getItems", q)
    var response = await request
    .get(`${BASE_URL}/items`)
    .query({key: API_KEY, ...q})
  //  
  } catch (err) {
    console.error("Error getting items")
    // do something with err...
    throw(err)
  }
  return response
}

async function getTags(q={}) {
  try {
    var response = await request
    .get(`${BASE_URL}/tags`)
    .query({key: API_KEY, ...q})
    .then(({body}) => body)
  //  
  } catch (err) {
    console.error("Error getting tags")
    // do something with err...
  }
  return response
}

async function getItemRelations(q={}) {
  try {
    var response = await request
    .get(`${BASE_URL}/itemrelations`)
    .query({key: API_KEY, ...q})
    .then(({body}) => body)
  //  
  } catch (err) {
    console.error("Error getting item relations")
    // do something with err...
  }
  return response
}

async function getStories(q={}) {
  try {
    var response = await request
    .get(`${BASE_URL}/exhibits`)
    .query({key: API_KEY, ...q})
    .then(({body}) => body)
  //  
  } catch (err) {
    // do something with err...
    console.error("Error getting stories")
  }
  return response
}

async function getPages(q={}) {
  try {
    var response = await request
    .get(`${BASE_URL}/exhibit_pages`)
    .query({key: API_KEY, ...q})
    .then(({body}) => body)
  //  
  } catch (err) {
    // do something with err...
    console.error("Error getting pages")
  }
  return response
}

async function getExhibits(q={}) {
  try {
    var response = await request
    .get(`${BASE_URL}/exhibits`)
    .query({key: API_KEY, ...q})
    .then(({body}) => body)
  //  
  } catch (err) {
    console.error("Error getting exhibits")
    // do something with err...
  }
  return response
}

async function getFiles(q={}) {
  try {
    var response = await request
    .get(`${BASE_URL}/files`)
    .query({key: API_KEY, ...q})
    .then(({body}) => body)
  //  
  } catch (err) {
    console.error("Error getting files")
    // do something with err...
  }
  return response
}


async function getSimplePages(q={}) {
  try {
    var response = await request
    .get(`${BASE_URL}/simple_pages`)
    .query({key: API_KEY, ...q})
    .then(({body}) => body)
  //  
  } catch (err) {
    // do something with err...
  }
  return response
}


function makeAttachment(attachment, allItems, allFiles){
  return {
    caption: attachment.caption,
    item: get(allItems, get(attachment, 'item.id')),
    file: get(allFiles, get(attachment, 'file.id')),
  }

}

function addPageAttachments(page, allItems, allFiles){
  const pageBlocks = get(page, 'page_blocks', [])
  const pageBlocksWithAttachments = pageBlocks.map(
    pageBlock => (
      {...pageBlock, attachments: get(pageBlock, 'attachments', []).map(attachment => makeAttachment(attachment, allItems, allFiles))}
    )
  )

  return {
    ...page,
    page_blocks: pageBlocksWithAttachments
  }


}


module.exports.getItems = getItems
module.exports.getItemsGreedy = greedyAPIMaker(getItems)
module.exports.getTags = getTags
module.exports.getItemRelations = getItemRelations

module.exports.addFilesToItems = addFilesToItems
module.exports.enrichWithRelations = enrichWithRelations
module.exports.addPageAttachments = addPageAttachments

module.exports.getPages = getPages
module.exports.getExhibits = getExhibits
module.exports.getFiles = getFiles
module.exports.getSimplePages = getSimplePages
