/* Copyright 2012 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

(function (root, factory) {
  if (typeof exports === 'object')
    module.exports = factory();
  else if (typeof define === 'function' && define.amd)
    define([], factory);
  else
    root.ASCPComposeMail = factory();
}(this, function() {
  

  return {
    Tags: {
      SendMail:        0x1505,
      SmartForward:    0x1506,
      SmartReply:      0x1507,
      SaveInSentItems: 0x1508,
      ReplaceMime:     0x1509,
      /* Missing tag value 0x150A */
      Source:          0x150B,
      FolderId:        0x150C,
      ItemId:          0x150D,
      LongId:          0x150E,
      InstanceId:      0x150F,
      Mime:            0x1510,
      ClientId:        0x1511,
      Status:          0x1512,
      AccountId:       0x1513,
    }
  };
}));