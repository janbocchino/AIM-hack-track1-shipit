import Foundation
import AppKit
import AVFoundation
import CoreText
import CoreVideo
import ImageIO
import UniformTypeIdentifiers

let root=URL(fileURLWithPath:CommandLine.arguments[1])
let W=1920, H=1080, fps=24
struct Scene: Decodable { let start: Double; let end: Double; let title: String }
struct Storyboard: Decodable { let duration: Double; let scenes: [Scene] }
let story=try JSONDecoder().decode(Storyboard.self,from:Data(contentsOf:root.appendingPathComponent("storyboard.json")))
let source=CGImageSourceCreateWithURL(root.appendingPathComponent("assets/levriq-logo-transparent.png") as CFURL,nil)!
let logo=CGImageSourceCreateImageAtIndex(source,0,nil)!.cropping(to:CGRect(x:20,y:140,width:1900,height:500))!
var layoutWarnings=Set<String>()

func color(_ hex: UInt32, _ alpha: CGFloat=1) -> CGColor {
    CGColor(srgbRed:CGFloat((hex>>16)&255)/255,green:CGFloat((hex>>8)&255)/255,blue:CGFloat(hex&255)/255,alpha:alpha)
}
let white=color(0xFFFFFF), navy=color(0x0B3048), teal=color(0x0C91AA), muted=color(0x637783)
let border=color(0xDCE5E9), soft=color(0xF5F8F9), pale=color(0xEDF7F8), amber=color(0x98641B)
func ease(_ x: Double) -> CGFloat { let t=max(0,min(1,x)); return CGFloat(t*t*(3-2*t)) }
func box(_ c: CGContext,_ r: CGRect,_ fill: CGColor,_ radius: CGFloat=0,_ stroke: CGColor?=nil,_ width: CGFloat=1) {
    let p=CGPath(roundedRect:r,cornerWidth:radius,cornerHeight:radius,transform:nil)
    c.addPath(p); c.setFillColor(fill); c.fillPath()
    if let stroke=stroke { c.addPath(p); c.setStrokeColor(stroke); c.setLineWidth(width); c.strokePath() }
}
func line(_ c: CGContext,_ points: [CGPoint],_ ink: CGColor=border,_ width: CGFloat=2,_ dash: [CGFloat]=[]) {
    guard let first=points.first else { return }
    c.saveGState(); c.setStrokeColor(ink); c.setLineWidth(width); c.setLineCap(.round); c.setLineJoin(.round); c.setLineDash(phase:0,lengths:dash)
    c.move(to:first); for p in points.dropFirst() { c.addLine(to:p) }; c.strokePath(); c.restoreGState()
}
func arrow(_ c: CGContext,_ points: [CGPoint],_ ink: CGColor=border,_ width: CGFloat=3) {
    line(c,points,ink,width)
    if points.count>1 {
        let a=points[points.count-2], b=points.last!, angle=atan2(b.y-a.y,b.x-a.x), s: CGFloat=12
        line(c,[CGPoint(x:b.x-s*cos(angle-0.5),y:b.y-s*sin(angle-0.5)),b,
                CGPoint(x:b.x-s*cos(angle+0.5),y:b.y-s*sin(angle+0.5))],ink,width)
    }
}
func font(_ size: CGFloat,_ weight: String) -> CTFont {
    CTFontCreateWithName((weight=="bold" ? "HelveticaNeue-Bold" : weight=="medium" ? "HelveticaNeue-Medium" : "HelveticaNeue") as CFString,size,nil)
}
func attr(_ s: String,_ size: CGFloat,_ ink: CGColor,_ weight: String) -> NSAttributedString {
    NSAttributedString(string:s,attributes:[NSAttributedString.Key(kCTFontAttributeName as String):font(size,weight),NSAttributedString.Key(kCTForegroundColorAttributeName as String):ink])
}
func measure(_ s: String,_ size: CGFloat,_ weight: String="regular") -> CGFloat {
    CGFloat(CTLineGetTypographicBounds(CTLineCreateWithAttributedString(attr(s,size,navy,weight)),nil,nil,nil))
}
func text(_ c: CGContext,_ s: String,_ x: CGFloat,_ y: CGFloat,_ size: CGFloat,_ ink: CGColor=navy,_ weight: String="regular",_ align: String="left") {
    let ct=CTLineCreateWithAttributedString(attr(s,size,ink,weight)), w=measure(s,size,weight)
    let px=align=="center" ? x-w/2 : align=="right" ? x-w : x
    if px<78 || px+w>1842 || y+size>1000 { layoutWarnings.insert("Text outside safe margins: \(s) [\(Int(px)), \(Int(y)), \(Int(w))]") }
    c.saveGState(); c.translateBy(x:px,y:y+CTFontGetAscent(font(size,weight))); c.scaleBy(x:1,y:-1)
    c.textMatrix = .identity; c.textPosition = .zero; CTLineDraw(ct,c); c.restoreGState()
}
func multiline(_ c: CGContext,_ lines: [String],_ x: CGFloat,_ y: CGFloat,_ size: CGFloat,_ ink: CGColor=navy,_ weight: String="medium",_ spacing: CGFloat=1.24) {
    for (i,s) in lines.enumerated() { text(c,s,x,y+CGFloat(i)*size*spacing,size,ink,weight) }
}
func brand(_ c: CGContext,_ x: CGFloat,_ y: CGFloat,_ width: CGFloat) {
    let height=width*CGFloat(logo.height)/CGFloat(logo.width)
    c.saveGState(); c.translateBy(x:x,y:y+height); c.scaleBy(x:1,y:-1)
    c.setBlendMode(.multiply); c.interpolationQuality = .high
    c.draw(logo,in:CGRect(x:0,y:0,width:width,height:height)); c.restoreGState()
}
func header(_ c: CGContext,_ title: String) {
    brand(c,88,43,316)
    text(c,title,542,56,57,title=="Medical emergency" ? color(0xA82D3D) : navy,"medium")
}
func fade(_ c: CGContext,_ progress: Double,_ body: () -> Void) {
    c.saveGState(); c.setAlpha(ease(progress)); body(); c.restoreGState()
}
func dot(_ c: CGContext,_ point: CGPoint,_ radius: CGFloat=7,_ ink: CGColor=teal) {
    c.setFillColor(ink); c.fillEllipse(in:CGRect(x:point.x-radius,y:point.y-radius,width:radius*2,height:radius*2))
}
func movingDot(_ c: CGContext,_ points: [CGPoint],_ progress: Double) {
    var lengths: [CGFloat]=[], total: CGFloat=0
    for i in 1..<points.count { let d=hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y); lengths.append(d); total+=d }
    var distance=CGFloat(progress-floor(progress))*total
    for (i,d) in lengths.enumerated() {
        if distance<=d { let f=distance/d; dot(c,CGPoint(x:points[i].x+(points[i+1].x-points[i].x)*f,y:points[i].y+(points[i+1].y-points[i].y)*f)); return }
        distance-=d
    }
}
func placeholder(_ c: CGContext,_ label: String) {
    let r=CGRect(x:680,y:270,width:1152,height:648)
    box(c,r,soft,10,border,1.5)
    c.saveGState(); c.setStrokeColor(teal); c.setLineWidth(3)
    c.strokeEllipse(in:CGRect(x:1216,y:440,width:80,height:80))
    c.beginPath(); c.move(to:CGPoint(x:1248,y:461)); c.addLine(to:CGPoint(x:1248,y:499)); c.addLine(to:CGPoint(x:1276,y:480)); c.closePath(); c.setFillColor(teal); c.fillPath(); c.restoreGState()
    text(c,"Product demo",1256,566,52,navy,"medium","center")
    text(c,"Placeholder",1256,639,34,muted,"regular","center")
    text(c,label,1256,807,36,teal,"medium","center")
}

func opening(_ c: CGContext,_ t: Double) {
    text(c,"02:00 · Emergency department",96,273,42,color(0xA82D3D),"medium")
    multiline(c,["Dizziness.","Blurred vision in the left eye."],96,397,86,navy,"medium",1.4)
    text(c,"She needs urgent medical assessment.",96,779,50,muted,"regular")
}
func task(_ c: CGContext,_ t: Double) {
    placeholder(c,"Role → question → results")
    multiline(c,["Emergency","physician"],96,288,62)
    line(c,[CGPoint(x:96,y:480),CGPoint(x:540,y:480)],border,2)
    fade(c,(t-0.5)/0.6) { multiline(c,["Dizziness and","left-eye vision","problems."],96,535,48,navy,"regular",1.3) }
    fade(c,(t-3)/0.6) { text(c,"What should I know?",96,829,43,teal,"medium") }
}
func evidence(_ c: CGContext,_ t: Double) {
    let phase=t<5.5 ? 0 : t<10.5 ? 1 : t<15.5 ? 2 : 3
    let starts: [Double]=[0,5.5,10.5,15.5]
    let labels=["Relevant findings","Missing information","Conflicting records","Original source passage"]
    placeholder(c,labels[phase])
    fade(c,(t-starts[phase])/0.4) {
        switch phase {
        case 0:
            multiline(c,["History.","Medications.","Allergies."],96,385,62)
        case 1:
            multiline(c,["Missing renal","function."],96,385,58)
            text(c,"Not documented.",96,586,42,amber,"medium")
        case 2:
            multiline(c,["Conflicting","records."],96,385,62)
            text(c,"Flagged for review.",96,600,40,amber,"medium")
        default:
            multiline(c,["Open the","original","passage."],96,385,62,teal)
        }
    }
}
func node(_ c: CGContext,_ x: CGFloat,_ y: CGFloat,_ width: CGFloat,_ height: CGFloat,_ n: String,_ name: String,_ sub: [String],_ active: Bool) {
    box(c,CGRect(x:x,y:y,width:width,height:height),active ? pale : white,10,active ? teal : border,active ? 2.5 : 1.5)
    text(c,n,x+26,y+20,30,active ? teal : muted,"medium")
    text(c,name,x+26,y+71,43,navy,"medium")
    for (i,s) in sub.enumerated() { text(c,s,x+26,y+137+CGFloat(i)*43,34,muted) }
}
func architecture(_ c: CGContext,_ t: Double) {
    let stage=t<4.5 ? 0 : t<8.5 ? 1 : t<12.5 ? 2 : t<19 ? 3 : 4
    let captions=["Keep facts with their sources.","Use the role and clinical question.","Retrieve the relevant evidence.","Verify before display.","Keep every finding traceable."]
    text(c,captions[stage],710,264,43,teal,"medium")
    let a=[CGPoint(x:516,y:394),CGPoint(x:605,y:394),CGPoint(x:605,y:528),CGPoint(x:710,y:528)]
    let b=[CGPoint(x:516,y:760),CGPoint(x:605,y:760),CGPoint(x:605,y:610),CGPoint(x:710,y:610)]
    let d=[CGPoint(x:1110,y:568),CGPoint(x:1280,y:568)]
    let e=[CGPoint(x:1540,y:706),CGPoint(x:1540,y:786)]
    arrow(c,a,stage==0 || stage==2 ? teal : border)
    arrow(c,b,stage==1 || stage==2 ? teal : border)
    arrow(c,d,stage==3 ? teal : border)
    arrow(c,e,stage==4 ? teal : border)
    node(c,96,286,420,216,"01","Extract facts",["Sources attached"],stage==0)
    node(c,96,652,420,216,"02","Understand task",["Role + question"],stage==1)
    node(c,710,460,400,216,"03","Retrieve",["Relevant facts"],stage==2)
    node(c,1280,430,552,276,"04","Verify",["Sources · Dates", "Calculations · Conflicts"],stage==3)
    node(c,1280,786,552,190,"05","Show evidence",["Findings + sources"],stage==4)
    if stage==0 { movingDot(c,a,t/2.5) }
    else if stage==1 { movingDot(c,b,(t-4.5)/2.5) }
    else if stage==2 { movingDot(c,a,(t-8.5)/2.4); movingDot(c,b,(t-8.5)/2.4) }
    else if stage==3 { movingDot(c,d,(t-12.5)/2.0) }
    else { movingDot(c,e,(t-19)/2.0) }
}
func role(_ c: CGContext,_ t: Double) {
    placeholder(c,"Anaesthesia assessment")
    multiline(c,["Emergency","physician"],96,282,46,muted,"regular",1.2)
    arrow(c,[CGPoint(x:274,y:428),CGPoint(x:274,y:478)],teal,3)
    fade(c,(t-1)/0.5) { text(c,"Anaesthetist",96,516,58,teal,"medium") }
    fade(c,(t-3)/0.5) { multiline(c,["Blood thinners.","Allergies.","Cardiac function."],96,664,43,navy,"regular",1.5) }
}
func value(_ c: CGContext,_ t: Double) {
    let rows=["Read the relevant history.","See gaps and conflicts.","Check the original source."]
    let starts: [Double]=[0.4,4.8,9.2]
    let active=t<4.8 ? 0 : t<9.2 ? 1 : 2
    for i in 0..<3 {
        fade(c,(t-starts[i])/0.7) {
            let y=CGFloat(326+i*203)
            dot(c,CGPoint(x:113,y:y+44),7,i==active ? teal : border)
            text(c,rows[i],164,y,76,i==active ? teal : navy,"medium")
        }
    }
}
func close(_ c: CGContext,_ t: Double) {
    fade(c,t/0.6) { brand(c,388,360,1144) }
}
func render(_ c: CGContext,_ time: Double) {
    c.setFillColor(white); c.fill(CGRect(x:0,y:0,width:W,height:H))
    let index=story.scenes.lastIndex(where:{time >= $0.start}) ?? 0
    let scene=story.scenes[index], t=time-scene.start
    if index<6 { header(c,scene.title) }
    c.saveGState(); c.setAlpha(ease(t/0.3)*ease((scene.end-time)/0.25))
    switch index {
    case 0: opening(c,t)
    case 1: task(c,t)
    case 2: evidence(c,t)
    case 3: architecture(c,t)
    case 4: role(c,t)
    case 5: value(c,t)
    default: close(c,t)
    }
    c.restoreGState()
}
func save(_ image: CGImage,_ target: URL) {
    let dst=CGImageDestinationCreateWithURL(target as CFURL,UTType.png.identifier as CFString,1,nil)!
    CGImageDestinationAddImage(dst,image,nil); CGImageDestinationFinalize(dst)
}
func frame(_ time: Double) -> CGImage {
    let c=CGContext(data:nil,width:W,height:H,bitsPerComponent:8,bytesPerRow:W*4,
        space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
    c.translateBy(x:0,y:CGFloat(H)); c.scaleBy(x:1,y:-1); render(c,time); return c.makeImage()!
}
func previews() throws {
    let times: [Double]=[3,12,21,26,32,37,43,50,56,63,73,83,88,94,101]
    for t in times { save(frame(t),root.appendingPathComponent("previews/frame-\(Int(t)).png")) }
    let picks: [Double]=[3,12,26,37,50,63,73,94,101]
    // Compact 3x3 sheet with the same 16:9 aspect as each scene.
    let compact=CGContext(data:nil,width:1920,height:1080,bitsPerComponent:8,bytesPerRow:1920*4,
        space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
    for (i,t) in picks.enumerated() { compact.draw(frame(t),in:CGRect(x:CGFloat(i%3)*640,y:CGFloat(2-i/3)*360,width:640,height:360)) }
    save(compact.makeImage()!,root.appendingPathComponent("previews/contact-sheet.png"))
    try JSONSerialization.data(withJSONObject:["warnings":Array(layoutWarnings).sorted()],options:.prettyPrinted).write(to:root.appendingPathComponent("layout-check.json"))
    print("Preview frames ready. Layout warnings: \(layoutWarnings.count)"); for w in layoutWarnings { print(w) }; fflush(stdout)
}
func encode() throws {
    let output=root.appendingPathComponent("levriq-demo.mp4")
    try? FileManager.default.removeItem(at:output)
    let writer=try AVAssetWriter(outputURL:output,fileType:.mp4)
    let input=AVAssetWriterInput(mediaType:.video,outputSettings:[AVVideoCodecKey:AVVideoCodecType.h264,
        AVVideoWidthKey:W,AVVideoHeightKey:H,AVVideoCompressionPropertiesKey:[AVVideoAverageBitRateKey:5_000_000,
        AVVideoProfileLevelKey:AVVideoProfileLevelH264HighAutoLevel,AVVideoMaxKeyFrameIntervalKey:48]])
    input.expectsMediaDataInRealTime=false
    let adaptor=AVAssetWriterInputPixelBufferAdaptor(assetWriterInput:input,sourcePixelBufferAttributes:[
        kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32BGRA,kCVPixelBufferWidthKey as String:W,
        kCVPixelBufferHeightKey as String:H,kCVPixelBufferCGImageCompatibilityKey as String:true,kCVPixelBufferCGBitmapContextCompatibilityKey as String:true])
    writer.add(input); guard writer.startWriting() else { throw writer.error! }; writer.startSession(atSourceTime:.zero)
    for n in 0..<Int(story.duration*Double(fps)) {
        while !input.isReadyForMoreMediaData { if writer.status == .failed { throw writer.error! }; Thread.sleep(forTimeInterval:0.004) }
        try autoreleasepool {
            var pb: CVPixelBuffer?; let status=CVPixelBufferPoolCreatePixelBuffer(nil,adaptor.pixelBufferPool!,&pb)
            guard status==kCVReturnSuccess, let buffer=pb else { throw NSError(domain:"video",code:Int(status)) }
            CVPixelBufferLockBaseAddress(buffer,[])
            let c=CGContext(data:CVPixelBufferGetBaseAddress(buffer),width:W,height:H,bitsPerComponent:8,bytesPerRow:CVPixelBufferGetBytesPerRow(buffer),
                space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGBitmapInfo.byteOrder32Little.rawValue|CGImageAlphaInfo.premultipliedFirst.rawValue)!
            c.translateBy(x:0,y:CGFloat(H)); c.scaleBy(x:1,y:-1); render(c,Double(n)/Double(fps))
            CVPixelBufferUnlockBaseAddress(buffer,[])
            guard adaptor.append(buffer,withPresentationTime:CMTime(value:Int64(n),timescale:Int32(fps))) else { throw writer.error! }
        }
        if n%(fps*10)==0 { print("Rendered \(n/fps) / \(Int(story.duration)) seconds"); fflush(stdout) }
    }
    input.markAsFinished(); writer.endSession(atSourceTime:CMTime(seconds:story.duration,preferredTimescale:600))
    let done=DispatchSemaphore(value:0); writer.finishWriting{done.signal()}; done.wait()
    guard writer.status == .completed else { throw writer.error! }
    print("Exported: \(output.path)")
}
try previews()
if !CommandLine.arguments.contains("--previews-only") { try encode() }
