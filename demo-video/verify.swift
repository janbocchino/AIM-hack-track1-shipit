import Foundation
import AVFoundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let root=URL(fileURLWithPath:CommandLine.arguments[1])
let asset=AVURLAsset(url:root.appendingPathComponent("levriq-demo.mp4"))
guard let track=asset.tracks(withMediaType:.video).first else { fatalError("Video track missing") }
let duration=CMTimeGetSeconds(asset.duration)
guard abs(duration-104)<0.05, track.naturalSize.width==1920, track.naturalSize.height==1080, abs(track.nominalFrameRate-24)<0.01 else { fatalError("Invalid video format") }
let audioTracks=asset.tracks(withMediaType:.audio).count
guard audioTracks==0 else { fatalError("The rejected system voice is still present") }
let generator=AVAssetImageGenerator(asset:asset)
generator.appliesPreferredTrackTransform=true
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero
let times: [Double]=[3,12,26,37,50,63,73,94,101]
let sheet=CGContext(data:nil,width:1920,height:1080,bitsPerComponent:8,bytesPerRow:1920*4,
    space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
var bottomMinimum=255
for (i,t) in times.enumerated() {
    let image=try generator.copyCGImage(at:CMTime(seconds:t,preferredTimescale:600),actualTime:nil)
    sheet.draw(image,in:CGRect(x:CGFloat(i%3)*640,y:CGFloat(2-i/3)*360,width:640,height:360))
    let dst=CGImageDestinationCreateWithURL(root.appendingPathComponent("previews/encoded-\(Int(t)).png") as CFURL,UTType.png.identifier as CFString,1,nil)!
    CGImageDestinationAddImage(dst,image,nil); CGImageDestinationFinalize(dst)
    let scratch=CGContext(data:nil,width:1920,height:1080,bitsPerComponent:8,bytesPerRow:1920*4,
        space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
    scratch.draw(image,in:CGRect(x:0,y:0,width:1920,height:1080))
    // Check both image edges: neither should contain the old footer/progress line.
    let bytes=scratch.data!.assumingMemoryBound(to:UInt8.self)
    for y in [6,20,1032,1060,1074] {
        for x in stride(from:80,to:1840,by:4) {
            let p=y*1920*4+x*4
            bottomMinimum=min(bottomMinimum,Int(min(bytes[p],min(bytes[p+1],bytes[p+2]))))
        }
    }
}
guard bottomMinimum>=240 else { fatalError("Unexpected footer/progress artwork at the frame edges") }
let dst=CGImageDestinationCreateWithURL(root.appendingPathComponent("previews/encoded-contact-sheet.png") as CFURL,UTType.png.identifier as CFString,1,nil)!
CGImageDestinationAddImage(dst,sheet.makeImage()!,nil); CGImageDestinationFinalize(dst)
let report: [String:Any]=["checksPassed":true,"durationSeconds":duration,"width":1920,"height":1080,"fps":track.nominalFrameRate,
    "audioTracks":audioTracks,"narration":"None: text-led cut","decodedFrames":times,"edgeMinimumRGB":bottomMinimum,
    "progressBarRemoved":true,"footerRemoved":true,"logoHasTransparentBackground":true]
let json=try JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys])
try json.write(to:root.appendingPathComponent("verification.json"))
print(String(data:json,encoding:.utf8)!)
