import _redis from 'redis'

import logger from '../logger'

const PUBSUB_PREFIX = 'ps.'

// Create an expiring message queue
class MessageQueue {
  constructor({ queueTimeout=24 * 3600, maxQueueSize = 255, redis = _redis } = {}) {
    this.redis = redis.createClient(process.env.REDIS_URL)
    this.redis_sub = this.redis.duplicate()
    this.queueTimeout = queueTimeout
    this.maxQueueSize = maxQueueSize
  }

  async getMessageCount(queueKey) {
    return new Promise((resolve, reject) => {
      this.redis.zcard(queueKey, (err, msgCount) => {
        if (err) {
          reject(err)
        }
        else {
          resolve(Number(msgCount))
        }
      })
    })
  }

  getLatestId() {
    return Date.now()
  }

  async addMessage(queueKey, message) {
    const pubsubQueueKey = PUBSUB_PREFIX + queueKey
    const msgCount = await this.getMessageCount(queueKey)

    return new Promise((resolve, reject) => {
      // Two steps, increment the message
      const timestamp = this.getLatestId()
      const multi_call = this.redis.multi()

      // Actually do the multicall
      multi_call.zadd(queueKey, timestamp, JSON.stringify(message))
        .expire(queueKey, this.queueTimeout)
        .publish(pubsubQueueKey, timestamp) // new message is here

      // If we're overflowing don't let this grow
      if (msgCount > this.maxQueueSize) {
        multi_call.zremrangebyrank(queueKey, 0, 0)
      }

      multi_call.exec((err, replies) => {
        logger.info('Multcall excuted...')
        if (err) {
          reject(err)
        } else {
          resolve(replies[0])
        }
      })
    })
  }

  async getMessages(queueKey, lastReadTimestamp) {
    return new Promise((resolve, reject) => {
      this.redis.zrangebyscore(queueKey,  '(' + lastReadTimestamp, '+inf', 'WITHSCORES', (err, result) => {
        if (err) {
          reject(err)
        } else {
          resolve(
            result.reduceRight( (acc, a) => {
              (!acc.length || acc[0].msg) ? acc.unshift({ msgId: Number(a) }) : acc[0].msg = JSON.parse(a)
              return acc
            }, [])
          )
        }
      })
    })
  }

  async getIndexMessage(queueKey, index) {
    return new Promise((resolve, reject) => {
      this.redis.zrange(queueKey, index, index, 'WITHSCORES', (err, result) => {
        if (err) {
          reject(err)
        } else {
          if (result && result.length) {
            resolve(
              result.reduceRight( (acc, a) => {
                (!acc.length || acc[0].msg) ? acc.unshift({ msgId: Number(a) }) : acc[0].msg = JSON.parse(a)
                return acc
              }, [])[0] )
          } else {
            resolve(null)
          }
        }
      })
    })
  }

  async getLastMessage(queueKey) {
    return this.getIndexMessage(queueKey, -1)
  }

  async getFirstMessage(queueKey) {
    return this.getIndexMessage(queueKey, 0)
  }

  // cb must be function(messageTimestamp)
  // returns cleanup function
  //
  subscribeMessage(queueKey, cb) {
    const events = this.redis_sub
    const pubsubQueueKey = PUBSUB_PREFIX + queueKey
    events.subscribe(pubsubQueueKey)

    const messageHandler = (channel, msgId) => {
      if(channel == pubsubQueueKey) {
        cb(msgId)
      }
    }
    events.on('message', messageHandler)
    return () => events.removeListener('message', messageHandler)
  }
}

export default MessageQueue
