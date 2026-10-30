package vn.fs.service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fs.config.CurrentUserAccess;
import vn.fs.dto.chat.ChatActionDto;
import vn.fs.dto.chat.ChatIntent;
import vn.fs.dto.chat.ChatProductDto;
import vn.fs.dto.chat.ChatRequestDto;
import vn.fs.dto.chat.ChatResponseDto;
import vn.fs.dto.chat.ChatSearchCriteriaDto;
import vn.fs.dto.chat.ChatStatusDto;
import vn.fs.dto.chat.ChatTurnDto;
import vn.fs.entity.Product;
import vn.fs.repository.ProductRepository;

@Service
public class ChatService {
	private final ProductRepository products;
	private final AiGateway ai;
	private final ChatIntentService intents;
	private final ChatRetrievalService retrieval;
	private final ChatPolicyService policies;
	private final ChatOrderSupportService orderSupport;
	private final ChatAnalyticsService analytics;
	private final CurrentUserAccess access;

	public ChatService(ProductRepository products, AiGateway ai, ChatIntentService intents,
			ChatRetrievalService retrieval, ChatPolicyService policies,
			ChatOrderSupportService orderSupport, ChatAnalyticsService analytics,
			CurrentUserAccess access) {
		this.products = products;
		this.ai = ai;
		this.intents = intents;
		this.retrieval = retrieval;
		this.policies = policies;
		this.orderSupport = orderSupport;
		this.analytics = analytics;
		this.access = access;
	}

	private final ChatDialogueMemory memory = new ChatDialogueMemory();
    private ChatOrchestrator orchestrator;
    @org.springframework.beans.factory.annotation.Autowired
    public void setOrchestrator(ChatOrchestrator value) { orchestrator = value; }
    private CartSyncService syncedCart;
    @org.springframework.beans.factory.annotation.Autowired
    public void setSyncedCart(CartSyncService value){syncedCart=value;}

	@Transactional(readOnly = true)
	public ChatResponseDto reply(ChatRequestDto request) {
		if(syncedCart!=null && access.currentEmail()!=null)request.setCartItems(syncedCart.chatItems());
		ChatDialogueMemory.State state = memory.get(access.currentEmail(), request.getSessionId());
		synchronized (state) {
			if (request.getRequestId() != null && request.getRequestId().equals(state.lastRequest) && state.lastResponse != null)
				return state.lastResponse;
			ChatResponseDto response = dialogue(request, state);
			state.lastRequest = response.getIntent() == ChatIntent.ORDER_SUPPORT ? null : request.getRequestId();
			state.lastResponse = response.getIntent() == ChatIntent.ORDER_SUPPORT ? null : response;
			return response;
		}
	}

	private ChatResponseDto dialogue(ChatRequestDto request, ChatDialogueMemory.State s) {
		long started = System.currentTimeMillis();
		String question = request.getMessage().trim(), q = intents.normalize(question);
		String guard = guardedAnswer(question);
		if (guard != null) return clarification(request, guard, started);
		if (privateText(question)) return clarification(request, "Bạn nhập thông tin giao hàng vào bản nháp đơn để mình xử lý đúng tài khoản nhé.", started);
        if (orchestrator != null && ai.isConfigured()) {
            if (!s.initialized) {
                s.displayed = products.findByStatusTrue().stream()
                    .filter(p -> Boolean.TRUE.equals(p.getStatus()) && request.getContextProductIds().contains(p.getProductId()))
                    .sorted(java.util.Comparator.comparingInt(p -> request.getContextProductIds().indexOf(p.getProductId())))
                    .map(Product::getProductId).collect(Collectors.toList());
                s.shortlist = new ArrayList<>(s.displayed);
                s.initialized = true;
            }
            return orchestrator.reply(request, s);
        }
		List<Product> catalog = products.findByStatusTrue().stream().filter(p -> Boolean.TRUE.equals(p.getStatus())).collect(Collectors.toList());
		ChatCatalogQuery search = new ChatCatalogQuery(intents, retrieval);
		if (!s.initialized) {
			s.displayed = search.byIds(request.getContextProductIds(), catalog).stream().map(Product::getProductId).collect(Collectors.toList());
			s.shortlist = new ArrayList<>(s.displayed); s.initialized = true;
			for (ChatTurnDto t : request.getHistory()) if ("user".equals(t.getRole()) && !privateText(t.getContent())
					&& (intents.classify(t.getContent()) == ChatIntent.DISCOVER_BOOKS || continuation(intents.normalize(t.getContent()))))
				updateSearch(t.getContent(), s, catalog, continuation(intents.normalize(t.getContent())));
			if (!request.getHistory().isEmpty()) s.awaitingPurchase = request.getHistory().get(request.getHistory().size()-1).getContent().startsWith("Bạn muốn mua cuốn nào");
		}
		if (request.getActiveProductId() != null && catalog.stream().anyMatch(p -> request.getActiveProductId().equals(p.getProductId())))
			s.focus = request.getActiveProductId();
		ChatIntent classified = intents.classify(question);
		boolean buy = isPurchaseRequest(q);
		if (classified == ChatIntent.ORDER_SUPPORT && !buy) {
			java.util.regex.Matcher id = java.util.regex.Pattern.compile("(?:#|don(?: hang)?(?: so)?\\s*)([0-9]{1,18})").matcher(q);
			return finish(request, id.find() ? orderSupport.orderById(Long.parseLong(id.group(1))) : orderSupport.latestOrders(),
				ChatIntent.ORDER_SUPPORT, List.of(), false, false, s, started);
		}
		if (classified == ChatIntent.POLICY) return finish(request, policies.answer(question), classified, List.of(), false, false, s, started);
		if (classified == ChatIntent.SMALL_TALK) return finish(request, smallTalk(question), classified, List.of(), false, false, s, started);
		if (!s.offered.isEmpty() && q.matches("^(co|ok|oke|dong y|duoc|xem|cho minh xem|tim sach nen tang lien quan|tim tai lieu nen tang lien quan)(?: nhe| nha| di)?[.!]*$")) {
			ChatSearchCriteriaDto c=s.criteria;
			if ("rating".equals(s.offered)) {
				s.criteria=new ChatSearchCriteriaDto(c.getMinPrice(),c.getMaxPrice(),c.getCategory(),c.getAuthor(),"",c.getTopics());
			} else if ("budget".equals(s.offered)) {
				s.criteria=new ChatSearchCriteriaDto(null,null,c.getCategory(),c.getAuthor(),"price-asc",c.getTopics()); s.criteria.setMinRating(c.getMinRating());
			} else {
				s.alternativeFor=s.query;
				boolean programming=intents.normalize(s.query).matches(".*(python|java|spring|lap trinh|backend).*");
				if (!programming) {
					s.offered="";
					return clarification(request,"Bạn muốn mở rộng sang chủ đề nào gần với nhu cầu này? Mình chưa tìm được phương án thay thế đủ phù hợp để tự chọn cho bạn.",started);
				}
				s.query="sách lập trình nền tảng";
				s.criteria=new ChatSearchCriteriaDto(c.getMinPrice(),c.getMaxPrice(),"",c.getAuthor(),"",List.of("lập trình"));
			}
			s.offered="";
			List<Product> options=search.search(s.query,s.criteria,catalog);
			if(options.isEmpty()) return finish(request,emptySearch(s,catalog),ChatIntent.DISCOVER_BOOKS,List.of(),false,false,s,started);
			return compose(request,s,options,ChatIntent.DISCOVER_BOOKS,"Tìm "+s.query+". Người dùng đã đồng ý xem phương án thay thế; ghi rõ điểm khác với yêu cầu ban đầu.",false,started);
		}
		if (isCategoryList(question)) return clarification(request, categoryAnswer(catalog), started);
		List<Product> named = search.named(question, catalog);
		String title = search.quoted(question);
		boolean similar = q.matches(".*\\b(gan giong|tuong tu|gan nhat)\\b.*");
		boolean ordinal = q.matches(".*\\b(cuon|quyen|sach)\\s+(thu\\s+)?(dau tien|dau|nhat|hai|ba|cuoi|[1-8])\\b.*") || q.matches(".*\\b(cuon|quyen|sach) thu (tu|nam)\\b.*");
		List<Product> reference = reference(q, s, catalog, ordinal);
		boolean detail = q.matches(".*(?:tai sao|vi sao|ly do).*(?:de xuat|chon).*") || new ChatConversationContext(intents).isDetail(q) || q.matches(".*\\b(noi ve|tac gia|co viet|nhan vat|noi gia|gia bao nhieu|con hang|ton kho|bao nhieu ban|ai viet)\\b.*");
		boolean compare = q.matches(".*\\b(so sanh|giong nhau|khac nhau|cuon nao|thu tu|doc truoc|dang mua hon)\\b.*");
		boolean within = q.matches(".*\\b(trong so|trong nhung|con lai|hai cuon nay|cuon nao|thu tu|doc truoc)\\b.*");
		boolean advice = q.matches(".*\\b(nen hoc|hoc .* hay .* truoc|lo trinh)\\b.*") && !compare;
		boolean fresh = q.matches("^(tim|goi y|toi muon doc|toi muon mua sach de|cho toi sach|co sach|co cuon nao).*") && !similar && !ordinal;
		if(fresh) { within=false; if(!q.contains("so sanh")) compare=false; }
		if(s.awaitingComparison && named.size()>=2) compare=true;
		if (!title.isEmpty() && named.isEmpty() && !q.matches(".*(?:trong ten|co tu).*")) {
			s.missingTitle = title; s.emptySearch = true; setList(s, List.of(), true);
			return finish(request, "Mình chưa tìm thấy “" + title + "” trong catalog hiện tại, nên chưa thể xác nhận giá hay tồn kho. Bạn muốn tìm tên gần giống hoặc sách cùng chủ đề không?",
				ChatIntent.PRODUCT_INFO, List.of(), false, false, s, started);
		}
		if (!s.missingTitle.isEmpty() && named.isEmpty() && (similar || q.matches(".*\\b(cuon do|no|hom qua|kiem tra lai)\\b.*"))) {
			if (!similar) return finish(request, "Mình vẫn chưa tìm thấy “" + s.missingTitle + "” trong catalog hiện tại. Mình chưa có lịch sử ẩn/xóa sản phẩm để xác minh lần bạn thấy trước đó và không thể đưa giá khi chưa xác định được sách.",
				ChatIntent.PRODUCT_INFO, List.of(), false, false, s, started);
			String missing = s.missingTitle;
			List<Product> near = catalog.stream().filter(p -> similarity(missing,p.getName()) >= 0.25)
				.sorted(java.util.Comparator.comparingDouble((Product p) -> similarity(missing,p.getName())).reversed()).limit(3).collect(Collectors.toList());
			setList(s, near, true);
			return finish(request, near.isEmpty() ? "Mình chưa thấy tên đủ gần với “" + missing + "”. Bạn nhớ tác giả hoặc chủ đề không?"
				: renderBooks("Các tên gần với “" + missing + "” dưới đây là sách khác, không phải cuốn bạn vừa tìm:",near,null,false),
				ChatIntent.DISCOVER_BOOKS,near,false,false,s,started);
		}
		if (!named.isEmpty()) s.missingTitle = "";
		if (s.awaitingPurchase && (named.size() == 1 || ordinal)) buy = true;
		if (buy) {
			List<Product> choices = !named.isEmpty() ? named : reference;
			if (choices.isEmpty() && isImplicitPurchase(q)) choices = search.byIds(s.displayed,catalog);
			if (named.isEmpty() && !isImplicitPurchase(q) && !ordinal && !q.matches(".*\\b(cuon nay|cuon do|sach nay|quyen nay|mua no)\\b.*")) choices = List.of();
			s.awaitingPurchase = choices.size() != 1;
			if (choices.size() == 1) { s.focus = choices.get(0).getProductId(); s.displayed = List.of(s.focus); }
			String answer = choices.size() == 1 ? "Mình chuẩn bị đơn cho “" + choices.get(0).getName() + "”. Để giao đúng người, mình sẽ kiểm tra tên, số điện thoại và địa chỉ nhận sách. Bạn sẽ xem tổng tiền rồi chọn Xác nhận đặt hàng trước khi đơn được tạo."
				: choices.isEmpty() ? "Bạn muốn mua cuốn nào? Bạn nhắn tên sách để mình chuẩn bị đơn nhé."
				: "Bạn muốn mua cuốn nào trong danh sách này? Bạn có thể nhắn tên hoặc số thứ tự.";
			return finish(request,answer,ChatIntent.PURCHASE,choices,false,false,s,started);
		}
		if (q.matches(".*\\b(loai|bo)\\s+(cuon|quyen|sach)\\b.*")) {
			List<Product> list = search.byIds(s.shortlist,catalog);
			if (list.isEmpty()) return clarification(request,emptyReference(s),started);
			Product removed = q.contains("dat nhat") ? list.stream().max(java.util.Comparator.comparingLong(retrieval::effectivePrice)).orElse(null)
				: q.contains("re nhat") ? list.stream().min(java.util.Comparator.comparingLong(retrieval::effectivePrice)).orElse(null)
				: named.size()==1 ? named.get(0) : ordinal && reference.size()==1 ? reference.get(0) : null;
			if (removed == null || !list.remove(removed)) return clarification(request,"Bạn muốn bỏ cuốn nào trong danh sách?",started);
			setList(s,list,true);
			return finish(request,renderBooks("Đã loại “"+removed.getName()+"” khỏi danh sách gợi ý.",list,null,false),ChatIntent.COMPARE_BOOKS,list,false,false,s,started);
		}
		if (detail && (!named.isEmpty() || !reference.isEmpty()) && !compare && !fresh) {
			List<Product> selected = named.isEmpty() ? reference : named;
			if (selected.size()>1) return clarification(request,"Bạn muốn hỏi cuốn nào? Bạn nhắn tên hoặc số thứ tự nhé.",started);
			Product p=selected.get(0); s.focus=p.getProductId(); s.displayed=List.of(s.focus);
			if(q.matches(".*\\b(tac gia|co viet|ai viet)\\b.*"))
				return finish(request,"Theo catalog, tác giả của “"+p.getName()+"” là "+p.getAuthor()+".",ChatIntent.PRODUCT_INFO,selected,false,false,s,started);
			if(isDeterministicProductInfo(question,ChatIntent.PRODUCT_INFO,selected))
				return finish(request,productInfo(question,p),ChatIntent.PRODUCT_INFO,selected,false,false,s,started);
			return compose(request,s,selected,ChatIntent.PRODUCT_INFO,question,false,started);
		}
		if ((detail || ordinal) && named.isEmpty() && reference.isEmpty() && !fresh && !compare)
			return clarification(request,emptyReference(s),started);
		if (compare && (within || !s.shortlist.isEmpty() || named.size()>=2)) {
			List<Product> selected = named.size()>=2 ? named : search.byIds(s.shortlist,catalog);
			if(selected.isEmpty()) return clarification(request,emptyReference(s),started);
			if(named.size()<2 && q.matches(".*(?:hai|2) cuon (?:sach )?nay.*") && selected.size()!=2) {
				s.awaitingComparison=true;
				return clarification(request,"Danh sách hiện có "+selected.size()+" cuốn. Bạn muốn so sánh hai cuốn nào? Nhắn tên của cả hai nhé.",started);
			}
			s.awaitingComparison=false;
			if(q.contains("re hon") || q.contains("re nhat")) {
				Product p=selected.stream().min(java.util.Comparator.comparingLong(retrieval::effectivePrice)).get();
				s.focus=p.getProductId(); s.displayed=List.of(s.focus);
				return finish(request,"Trong danh sách này, “"+p.getName()+"” có giá thấp nhất: "+money(retrieval.effectivePrice(p))+".",ChatIntent.COMPARE_BOOKS,List.of(p),false,false,s,started);
			}
			if(q.contains("lap bang") || q.contains("rating") || q.contains("danh gia cao"))
				return finish(request,comparisonTable(selected),ChatIntent.COMPARE_BOOKS,selected,false,false,s,started);
			return compose(request,s,selected,ChatIntent.COMPARE_BOOKS,question,false,started);
		}
		if(advice) return compose(request,s,List.of(),ChatIntent.UNKNOWN,question,true,started);
		if(!named.isEmpty() && !fresh) {
			s.focus=named.get(0).getProductId(); s.displayed=List.of(s.focus);
			return compose(request,s,named,ChatIntent.PRODUCT_INFO,question,false,started);
		}
		updateSearch(question,s,catalog,continuation(q) || within);
		List<Product> found=search.search(s.query,s.criteria,catalog);
		if(!named.isEmpty()) found=named;
		if(within && !s.shortlist.isEmpty()) found=found.stream().filter(p -> s.shortlist.contains(p.getProductId())).collect(Collectors.toList());
		if(q.contains("sach khac") || q.contains("cuon khac") || q.contains("sach re hon")) {
			List<Long> seen=new ArrayList<>(s.shortlist);
			long ceiling=search.byIds(seen,catalog).stream().mapToLong(retrieval::effectivePrice).min().orElse(Long.MAX_VALUE);
			found=found.stream().filter(p -> !seen.contains(p.getProductId()) && (!q.contains("re hon") || retrieval.effectivePrice(p)<ceiling)).collect(Collectors.toList());
		}
		if(found.isEmpty()) { s.emptySearch=true; setList(s,List.of(),true); return finish(request,emptySearch(s,catalog),ChatIntent.DISCOVER_BOOKS,List.of(),false,false,s,started); }
		boolean structured=!s.criteria.getSort().isEmpty() || s.criteria.getMinPrice()!=null || s.criteria.getMaxPrice()!=null || s.criteria.getMinRating()!=null;
		if(structured && (search.semanticConstraint(s.query) || !s.criteria.getAuthor().isEmpty() || !s.criteria.getCategory().isEmpty() || intents.isBudgetOnlyDiscovery(question)
				|| s.query.equals(question) && s.criteria.getTopics().isEmpty() && !s.criteria.getSort().isEmpty())) {
			int count=requestedCount(question);
			boolean bundle=s.criteria.getMaxPrice()!=null && count>1 && q.matches(".*\\b(chon|toi co|tong ngan sach|mua may)\\b.*");
			if(bundle) {
				List<Product> chosen=new ArrayList<>(); long remaining=s.criteria.getMaxPrice();
				for(Product p:found.stream().filter(p -> p.getQuantity()>0).sorted(java.util.Comparator.comparingLong(retrieval::effectivePrice)).collect(Collectors.toList()))
					if(chosen.size()<count && retrieval.effectivePrice(p)<=remaining) { chosen.add(p); remaining-=retrieval.effectivePrice(p); }
				found=chosen;
			}
			found=found.stream().limit(count).collect(Collectors.toList()); setList(s,found,true);
			String answer=compare ? comparisonTable(found) : renderBooks("Mình tìm được "+found.size()+" cuốn phù hợp:",found,null,false);
			if(bundle) answer+="\n\nTổng tiền sách: "+money(found.stream().mapToLong(retrieval::effectivePrice).sum())+". Chưa gồm phí giao hàng.";
			if(found.size()<count && q.matches(".*\\d+\\s*(cuon|sach|quyen).*")) answer+="\nChưa có đủ "+count+" đầu sách đáp ứng các điều kiện này.";
			if("new".equals(s.criteria.getSort())) answer+="\nSắp xếp theo ngày cập nhật vào cửa hàng, không phải ngày xuất bản.";
			if(s.criteria.getMinRating()!=null) answer+="\nChỉ dùng đánh giá thực tế đã ghi nhận; sách chưa có đánh giá không nằm trong kết quả này.";
			return finish(request,answer,compare ? ChatIntent.COMPARE_BOOKS : ChatIntent.DISCOVER_BOOKS,found,false,false,s,started);
		}
		return compose(request,s,found,ChatIntent.DISCOVER_BOOKS,question,false,started);
	}

	private ChatResponseDto compose(ChatRequestDto request,ChatDialogueMemory.State s,List<Product> eligible,ChatIntent intent,String question,boolean advice,long started) {
		List<Product> candidates=eligible.stream().limit(80).collect(Collectors.toList());
		java.util.Map<Long,Double> ratings=retrieval.ratingSnapshot();
		List<ChatTurnDto> history=request.getHistory().stream().filter(t -> !privateText(t.getContent())).collect(Collectors.toList());
		ChatDialogueInterpreter.Decision d=new ChatDialogueInterpreter(ai).interpret(question,history,s,candidates,advice?"ADVICE":intent.name(),ratings,requestedCount(question));
		List<Product> selected=new ArrayList<>(); String answer=""; boolean used=d!=null;
		if(d!=null) {
			List<Long> ids=d.recommendations.stream().map(r -> r.productId).distinct().collect(Collectors.toList());
			selected=new ChatCatalogQuery(intents,retrieval).byIds(ids,candidates).stream().limit(intent==ChatIntent.PRODUCT_INFO?1:requestedCount(question)).collect(Collectors.toList());
			// If a model over-selects, its surrounding prose may reference books we did not keep.
			if(ids.size()>selected.size()) { d.intro="Dựa trên yêu cầu của bạn, mình chọn:"; d.closing=""; }
			if("PURCHASE".equals(d.intent) && selected.size()==1 && !question.matches(".*[?？].*") && !intents.normalize(question).matches(".*\\b(khong|chua|dung|huy)\\b.*")) {
				intent=ChatIntent.PURCHASE; s.awaitingPurchase=false; s.focus=selected.get(0).getProductId();
				answer="Mình chuẩn bị bản nháp cho “"+selected.get(0).getName()+"”. Bạn kiểm tra thông tin giao hàng và tổng tiền trước khi xác nhận nhé.";
			} else if(advice || selected.isEmpty() && ("ADVICE".equals(d.intent) || "UNKNOWN".equals(d.intent) || "SMALL_TALK".equals(d.intent))) {
				selected=List.of(); answer=(d.intro+"\n\n"+d.closing).trim(); intent=ChatIntent.UNKNOWN;
			} else answer=renderBooks(d.intro,selected,d,intent==ChatIntent.PRODUCT_INFO)+(d.closing.isBlank()?"":"\n\n"+d.closing);
			if(answer.isBlank() || selected.isEmpty() && (intent==ChatIntent.PRODUCT_INFO || intent==ChatIntent.COMPARE_BOOKS)) { d=null; used=false; }
		}
		if(d==null) {
			if(advice) answer=adviceFallback(question);
			else if(intent==ChatIntent.PRODUCT_INFO) { selected=candidates.stream().limit(1).collect(Collectors.toList()); answer=productInfo(question,selected.get(0)); }
			else if(intent==ChatIntent.COMPARE_BOOKS) { selected=candidates; answer=comparisonTable(selected)+"\n\n"+selected.stream().map(p -> "• "+p.getName()+": "+ChatDialogueInterpreter.clean(p.getDescription(),500)).collect(Collectors.joining("\n")); }
			else {
				ChatCatalogQuery search=new ChatCatalogQuery(intents,retrieval);
				selected=(search.semanticConstraint(s.query) || !s.criteria.getAuthor().isEmpty() || !s.criteria.getCategory().isEmpty()
						|| intents.normalize(s.query).matches("^(con )?(cuon|sach) khac(?: khong)?[?!]*$")
						? candidates : retrieval.directMatches(question,s.criteria,candidates)).stream().limit(requestedCount(question)).collect(Collectors.toList());
				answer=selected.isEmpty()?"Bạn muốn đọc chủ đề gì, cho bản thân hay làm quà? Mình sẽ dựa vào đó để chọn sách phù hợp.":renderBooks("Bạn có thể tham khảo:",selected,null,false);
			}
			if(ai.isConfigured()) answer="Mình chưa nhận được phần trả lời AI đủ tin cậy; dưới đây là thông tin có thể đối chiếu. "+answer;
		}
		if(intent==ChatIntent.DISCOVER_BOOKS) {
			setList(s,selected,true); s.emptySearch=selected.isEmpty();
			if(selected.isEmpty() && d!=null) answer=emptySearch(s,eligible);
		} else if(!selected.isEmpty()) { setList(s,selected,false); if(selected.size()==1) s.focus=selected.get(0).getProductId(); }
		return finish(request,answer,intent,selected,used,ai.isConfigured()&&!used,s,started);
	}

	private void updateSearch(String question,ChatDialogueMemory.State s,List<Product> catalog,boolean follow) {
		String q=intents.normalize(question);
		if(q.contains("da biet")) { s.level=ChatDialogueInterpreter.clean(question,180); return; }
		if(q.contains("moi bat dau")) { s.level="Người mới bắt đầu"; return; }
		ChatSearchCriteriaDto c=intents.criteria(question,catalog), old=s.criteria;
		if(!follow || s.query.isEmpty()) { s.query=question; s.goal=ChatDialogueInterpreter.clean(question,240); s.criteria=c; s.missingTitle=""; s.offered=""; s.alternativeFor=""; }
		else {
			s.criteria=new ChatSearchCriteriaDto(c.getMinPrice()!=null?c.getMinPrice():old.getMinPrice(),c.getMaxPrice()!=null?c.getMaxPrice():old.getMaxPrice(),
				c.getCategory().isEmpty()?old.getCategory():c.getCategory(),c.getAuthor().isEmpty()?old.getAuthor():c.getAuthor(),c.getSort().isEmpty()?old.getSort():c.getSort(),old.getTopics());
			s.criteria.setMinRating(c.getMinRating()!=null?c.getMinRating():old.getMinRating());
			if(q.contains("toi muon hoc") || q.contains("chuyen sang") || q.contains("doi chu de")) {
				s.query=question;
				s.criteria=new ChatSearchCriteriaDto(s.criteria.getMinPrice(),s.criteria.getMaxPrice(),c.getCategory(),c.getAuthor(),c.getSort(),c.getTopics());
				s.criteria.setMinRating(c.getMinRating());
			}
		}
		if(q.contains("bo qua gia") || q.contains("khong gioi han gia")) {
			ChatSearchCriteriaDto r=s.criteria; s.criteria=new ChatSearchCriteriaDto(null,null,r.getCategory(),r.getAuthor(),"",r.getTopics()); s.criteria.setMinRating(r.getMinRating());
		}
	}
	private boolean continuation(String q) { return q.matches("^(chi |trong |toi moi|toi da biet|ngan sach|vay |hay chon|chon giup|loai |bo |con cuon|sach khac|sach re hon|toi muon hoc|neu |giai thich|doi sang|chuyen sang).*"); }
	private List<Product> reference(String q,ChatDialogueMemory.State s,List<Product> catalog,boolean ordinal) {
		ChatCatalogQuery search=new ChatCatalogQuery(intents,retrieval);
		if(ordinal) {
			List<Product> list=search.byIds(s.displayed,catalog); int i=-1;
			if(q.matches(".*(?:cuon|sach|quyen)\\s+(?:thu\\s+)?(?:dau tien|dau|nhat|1)\\b.*")) i=0;
			else if(q.matches(".*(?:cuon|sach|quyen)\\s+(?:thu\\s+)?(?:hai|2)\\b.*")) i=1;
			else if(q.matches(".*(?:cuon|sach|quyen)\\s+(?:thu\\s+)?(?:ba|3)\\b.*")) i=2;
			else if(q.contains("cuoi")) i=list.size()-1;
			else { java.util.regex.Matcher m=java.util.regex.Pattern.compile("(?:thu )?([1-8])\\b").matcher(q); if(m.find()) i=Integer.parseInt(m.group(1))-1; }
			return i>=0 && i<list.size()?List.of(list.get(i)):List.of();
		}
		if(s.focus!=null && q.matches(".*\\b(cuon nay|cuon do|cuon sach nay|cuon sach do|sach nay|sach do|quyen nay|no|noi ro|noi ky|tom tat|chi tiet|mua|dat|chot|lay)\\b.*")) return search.byIds(List.of(s.focus),catalog);
		return s.displayed.size()==1?search.byIds(s.displayed,catalog):List.of();
	}
	private void setList(ChatDialogueMemory.State s,List<Product> list,boolean replace) {
		s.displayed=list.stream().map(Product::getProductId).collect(Collectors.toList());
		if(replace) { s.shortlist=new ArrayList<>(s.displayed); s.focus=null; s.awaitingComparison=false; }
	}
	private String emptyReference(ChatDialogueMemory.State s) {
		return s.emptySearch?"Ở lượt trước mình chưa tìm được sách phù hợp nên chưa có cuốn nào để chọn hoặc so sánh. Bạn muốn tìm tài liệu nền tảng liên quan không?"
			:"Bạn đang hỏi cuốn sách nào? Bạn nhắn tên hoặc số thứ tự trong danh sách để mình trả lời đúng nhé.";
	}
	private String emptySearch(ChatDialogueMemory.State s,List<Product> catalog) {
		ChatSearchCriteriaDto c=s.criteria;
		ChatSearchCriteriaDto topic=new ChatSearchCriteriaDto(null,null,c.getCategory(),c.getAuthor(),"",c.getTopics());
		boolean hasTopic=!new ChatCatalogQuery(intents,retrieval).search(s.query,topic,catalog).isEmpty();
		String conditions=!c.getTopics().isEmpty()?String.join(", ",c.getTopics()):ChatDialogueInterpreter.clean(s.query,160);
		String answer="Mình chưa tìm thấy sách đáp ứng yêu cầu “"+conditions+"”";
		if(c.getMaxPrice()!=null) answer+=" trong mức "+money(c.getMaxPrice());
		if(c.getMinRating()!=null) answer+=c.getMinRating()>0 ? " với đánh giá từ "+c.getMinRating()+"/5" : " có đánh giá thực tế";
		answer+=".";
		if(hasTopic && c.getMinRating()!=null) { s.offered="rating"; return answer+" Có thể sách phù hợp chưa có đánh giá. Bạn muốn xem các sách đó và ghi rõ chưa có rating không?"; }
		if(hasTopic && (c.getMaxPrice()!=null || c.getMinPrice()!=null)) { s.offered="budget"; return answer+" Bạn muốn xem lựa chọn gần mức ngân sách nhất không?"; }
		s.offered="related";
		return answer+" Bạn muốn mình tìm sách nền tảng liên quan? Mình sẽ ghi rõ đó là phương án thay thế.";
	}
	private String renderBooks(String intro,List<Product> selected,ChatDialogueInterpreter.Decision d,boolean detail) {
		StringBuilder out=new StringBuilder(intro==null?"":intro);
		for(Product p:selected) {
			String reason=d==null?ChatDialogueInterpreter.clean(p.getDescription(),detail?1800:220):d.recommendations.stream().filter(r -> p.getProductId().equals(r.productId)).map(r -> r.reason).findFirst().orElse("");
			out.append("\n\n• “").append(p.getName()).append("” — ").append(value(p.getAuthor(),"Chưa có tác giả"));
			if(!detail) out.append(" · ").append(money(retrieval.effectivePrice(p)));
			if(!reason.isBlank()) out.append("\n").append(reason);
		}
		return out.toString().trim();
	}
	private String comparisonTable(List<Product> list) {
		StringBuilder b=new StringBuilder("So sánh nhanh theo dữ liệu hiện có:\n\n| Sách | Tác giả | Giá | Rating |\n|---|---|---:|---:|");
		for(Product p:list) { Double rating=retrieval.averageRating(p); b.append("\n| ").append(p.getName().replace("|"," ")).append(" | ").append(value(p.getAuthor(),"Chưa có dữ liệu").replace("|"," ")).append(" | ").append(money(retrieval.effectivePrice(p))).append(" | ").append(rating==null?"Chưa có đánh giá":String.format(Locale.ROOT,"%.1f/5",rating)).append(" |"); }
		return b.toString();
	}
	private ChatResponseDto finish(ChatRequestDto r,String answer,ChatIntent intent,List<Product> selected,boolean usedAi,boolean fallback,ChatDialogueMemory.State s,long started) {
		List<ChatActionDto> actions=actions(intent,selected);
		for(Product p:selected) if(p.getQuantity()>0) actions.add(new ChatActionDto("BUY_NOW","Mua ngay",p.getProductId(),null,true));
		String provider=usedAi?ai.provider():"local";
		return new ChatResponseDto(answer,provider,usedAi?ai.model():"",fallback,selected.stream().map(this::toDto).collect(Collectors.toList()),
			intent==ChatIntent.PURCHASE?List.of():chips(intent,selected),
			analytics.record(r.getSessionId(),intent,provider,fallback,selected.size(),System.currentTimeMillis()-started),intent,s.criteria,actions);
	}
	private int requestedCount(String value) {
		String q=intents.normalize(value); java.util.regex.Matcher m=java.util.regex.Pattern.compile("(\\d{1,2})\\s*(cuon|quyen|sach)").matcher(q);
		if(m.find()) return Math.max(1,Math.min(8,Integer.parseInt(m.group(1))));
		if(q.matches(".*\\b(hai cuon|hai quyen).*")) return 2;
		if(q.matches(".*\\b(mot cuon|re nhat|thap nhat|phu hop nhat|chon mot|cao nhat).*")) return 1;
		return 5;
	}
	private double similarity(String a,String b) {
		java.util.Set<String> x=new java.util.HashSet<>(List.of(intents.normalize(a).split("\\W+"))), y=new java.util.HashSet<>(List.of(intents.normalize(b).split("\\W+")));
		x.removeAll(java.util.Set.of("sach","cuon","voi","with","the","and")); y.removeAll(java.util.Set.of("sach","cuon","voi","with","the","and"));
		return (double)x.stream().filter(y::contains).count()/Math.max(1,Math.min(x.size(),y.size()));
	}
	private static boolean privateText(String value) { return value!=null && value.matches("(?is).*(?:\\b0[0-9 .-]{9,14}\\b|[\\w.+-]+@[\\w.-]+\\.[a-z]{2,}|mật khẩu|OTP).*"); }
	private String adviceFallback(String question) {
		String q=intents.normalize(question);
		if(q.contains("python") && q.contains("java")) return "Nếu bạn mới bắt đầu và chưa chọn hướng đi, Python thường dễ làm quen nhờ cú pháp gọn. Nếu mục tiêu là backend Java/Spring Boot hoặc chương trình học dùng Java, bạn có thể bắt đầu thẳng với Java. Bạn muốn học để làm web, phân tích dữ liệu hay theo môn học?";
		return "Bạn muốn học để làm gì và hiện đã biết đến đâu? Mình cần hai thông tin này để đề xuất lộ trình phù hợp.";
	}

	public ChatStatusDto status() {
		return new ChatStatusDto(ai.isConfigured() ? ai.provider() : "local",
				ai.isConfigured() ? ai.model() : "", ai.isConfigured());
	}

	private ChatResponseDto clarification(ChatRequestDto request, String answer, long started) {
		return new ChatResponseDto(answer, "local", "", false, Collections.emptyList(), Collections.emptyList(),
				analytics.record(request.getSessionId(), ChatIntent.UNKNOWN, "local", false, 0, System.currentTimeMillis() - started),
				ChatIntent.UNKNOWN, ChatSearchCriteriaDto.empty(), Collections.emptyList());
	}

	private String guardedAnswer(String question) {
		String q = intents.normalize(question);
		if (q.matches(".*(?:thoi tiet|tong thong|phuong trinh|viet.*code|fibonacci).*"))
			return "Mình hỗ trợ tìm sách, tư vấn đọc và mua hàng tại VinaBook. Câu hỏi này nằm ngoài phạm vi hỗ trợ hiện tại; nếu cần tài liệu học về chủ đề này, mình có thể giúp tìm sách.";
		if (q.matches(".*(?:bo qua.*vai tro|gia vo.*database|email.*khach hang|tu tao.*cau tra loi|lenh tu developer).*"))
			return "Mình chỉ sử dụng thông tin được phép để hỗ trợ mua sách; không cung cấp dữ liệu khách hàng, nhận quyền quản trị qua tin nhắn hoặc tự tạo thông tin chưa xác minh.";
		if (q.matches(".*(?:bao nhieu trang|nha xuat ban|xuat ban nam).*"))
			return "Dữ liệu catalog hiện chưa có trường số trang, nhà xuất bản và năm xuất bản để mình xác nhận chính xác. Bạn có thể đối chiếu thông tin trên bìa hoặc trang bản quyền của sách.";
		if (q.contains("khi nao") && q.contains("het hang"))
			return "Mình có thể kiểm tra tồn kho hiện tại của một cuốn sách, nhưng chưa có dữ liệu tốc độ bán để dự đoán khi nào sẽ hết hàng. Bạn cho mình tên sách nhé.";
		if (q.contains("da bi xoa"))
			return "Sản phẩm có thể đã được ẩn hoặc ngừng bán, nhưng đó chỉ là khả năng. Mình chưa có lịch sử thay đổi catalog để xác nhận việc xóa sản phẩm.";
		if (q.matches(".*(?:mat khau.*admin|xoa.*database|toan bo du lieu khach hang|api key|system prompt).*"))
			return "Mình không cung cấp thông tin bảo mật, dữ liệu khách hàng hoặc hỗ trợ phá hoại hệ thống. Mình có thể giúp bạn tìm sách và tra cứu đơn hàng của chính bạn.";
		if (q.contains("ceo") || q.contains("ban lanh dao")) return "Mình chưa có dữ liệu xác minh về ban lãnh đạo VinaBook.";
		if (q.contains("nam ngoai") || q.contains("doanh thu") || q.contains("doanh so"))
			return "Mình không có báo cáo doanh số theo năm để trả lời chính xác. Số lượng tồn kho hiện tại không phải số sách đã bán trong năm.";
		if (q.contains("doan gia") || q.contains("du ban khong kiem tra"))
			return "Mình cần kiểm tra đúng cuốn sách trong catalog trước khi xác nhận giá hoặc tồn kho. Bạn cho mình tên sách nhé.";
		if (q.contains("moi phat hanh") || q.contains("vua phat hanh"))
			return "Mình chưa có dữ liệu ngày phát hành để lọc chính xác. Mình có thể tìm sách mới cập nhật tại cửa hàng hoặc sách có đánh giá tốt; bạn muốn xem nhóm nào?";
		if (q.contains("giup toi lam gi") || q.contains("lam duoc gi"))
			return "Mình có thể tìm và so sánh sách, tư vấn theo nhu cầu và ngân sách, chuẩn bị đơn mua sách để bạn xác nhận, giải đáp giao hàng và tra cứu đơn hàng của bạn.";
		if (q.matches(".*(?:khong biet nen doc gi|kieu kieu|mot cuon sach hay).*" ) || q.matches("[?\\s]*sach[?\\s]*"))
			return "Bạn muốn đọc để thư giãn hay học thêm kiến thức? Cho mình biết chủ đề yêu thích và khoảng ngân sách để gợi ý phù hợp nhé.";
		return null;
	}

	static boolean isPurchaseRequest(String q) {
		if (q.matches(".*\\b(chi lay|chi chon|de hoc|hoc tieng|lam qua|qua sinh nhat|goi y|tu van|duoi|ngan sach|khoang)\\b.*")) return false;
		q = q.replaceAll("^(?:(?:toi|minh|t|em) )?(?:(?:muon|can) )?(?:doi sang|chuyen sang) ", "mua ");
		q = q.replaceAll("\\bdat don\\b", "mua").replaceAll("\\bdat hang\\b", "mua").replaceAll("\\bdat(?= (?:cuon|sach|quyen))", "mua");
		if (q.matches(".*\\b(khong|chua|dung|huy|bao nhieu|the nao|lam sao|cach mua)\\b.*")) return false;
		return isImplicitPurchase(q) || q.matches(".*\\b(mua|dat mua|chot|lay)\\s+(ngay\\s+)?([0-9]{1,2}\\s+)?(cuon|sach|quyen|ban|no)\\b.*")
			|| q.matches(".*\\b(toi|minh|t|em|anh|chi)\\s+(muon\\s+|se\\s+)?(mua|dat mua|chot|lay)\\b.*");
	}

	private static boolean isImplicitPurchase(String q) {
		q = q.replaceAll("\\bdat don\\b", "mua").replaceAll("\\bdat hang\\b", "mua");
		// Whole-message match: never substitute an unknown explicit title or ordinal.
		return q.replaceAll("[!.,]+$", "").trim().matches(
				"(?:(?:giup|ho) )?(?:(?:toi|minh|t|em|anh|chi) )?(?:(?:muon|se) )?(?:mua|dat mua|chot|lay)(?: ngay)?(?: (?:giup|ho)(?: (?:toi|minh|t|em))?)?(?: nhe| nha| di| a)?");
	}

	private String smallTalk(String question) {
		String q = intents.normalize(question);
		if (q.contains("cam on")) return "Rất vui được giúp bạn. Bạn cần tìm hiểu thêm cuốn nào thì cứ nhắn mình nhé.";
		return "Chào bạn! Mình có thể tìm và so sánh sách, chuẩn bị đơn để bạn xác nhận, giải đáp giao hàng và tra cứu đơn hàng của bạn. Bạn đang cần hỗ trợ gì?";
	}

	private String productInfo(String question, Product product) {
		String q = intents.normalize(question).replace(intents.normalize(product.getName()), "").trim();
		if (contains(q, "con hang", "ton kho", "bao nhieu ban", "bao nhieu cuon", "con may")) {
			return product.getQuantity() > 0
					? "Theo dữ liệu hiện tại, “" + product.getName() + "” còn " + product.getQuantity() + " cuốn. Số lượng có thể thay đổi khi có đơn hàng mới."
					: "“" + product.getName() + "” hiện đang hết hàng.";
		}
		if (isPriceQuestion(q)) {
			return "“" + product.getName() + "” hiện có giá " + money(retrieval.effectivePrice(product))
					+ (product.getDiscount() > 0 ? ", giảm " + product.getDiscount() + "% từ " + money(Math.round(product.getPrice())) : ".");
		}
		String description = product.getDescription() == null || product.getDescription().trim().isEmpty()
				? "Mô tả đang được cập nhật." : product.getDescription().trim();
		return "“" + product.getName() + "” của " + value(product.getAuthor(), "tác giả đang cập nhật") + ". " + description
				+ "\n\nHiện mình chỉ có mô tả catalog để đối chiếu. Bạn có thể gửi đoạn văn hoặc chi tiết muốn tìm hiểu; mình chưa có đủ căn cứ để xác minh nội dung ngoài mô tả này.";
	}

	private List<ChatActionDto> actions(ChatIntent intent, List<Product> selected) {
		List<ChatActionDto> result = new ArrayList<>();
		for (Product product : selected) {
			result.add(new ChatActionDto("VIEW_PRODUCT", "Xem " + product.getName(), product.getProductId(), "/product/" + product.getProductId(), false));
			if (product.getQuantity() > 0) result.add(new ChatActionDto("ADD_TO_CART", "Thêm vào giỏ", product.getProductId(), "", true));
		}
		if (intent == ChatIntent.ORDER_SUPPORT) {
			if (access.currentEmail() == null) result.add(new ChatActionDto("LOGIN", "Đăng nhập", null, "/login", false));
			else result.add(new ChatActionDto("VIEW_ORDERS", "Xem đơn hàng", null, "/orders", false));
		}
		return result;
	}

	private List<String> chips(ChatIntent intent, List<Product> selected) {
		if (intent == ChatIntent.PRODUCT_INFO && selected.size() == 1)
			return List.of("Tóm tắt nội dung cuốn này", "Cuốn này có khó đọc không?", "Giá cuốn này bao nhiêu?");
		if (!selected.isEmpty()) return List.of("Còn cuốn khác không?", "So sánh các cuốn này", "Sách rẻ hơn");
		if (intent == ChatIntent.POLICY) return List.of("Phí giao hàng thế nào?", "Có những cách thanh toán nào?", "Chính sách đổi trả");
		if (intent == ChatIntent.ORDER_SUPPORT) return List.of("Đơn hàng của tôi", "Cách đặt hàng?");
		return List.of("Gợi ý sách dưới 150k", "Tìm sách làm quà", "Có những thể loại nào?");
	}

	private ChatProductDto toDto(Product product) {
		return new ChatProductDto(product.getProductId(), product.getName(), value(product.getAuthor(), "Đang cập nhật"),
				category(product), retrieval.effectivePrice(product), product.getPrice() == null ? 0 : product.getPrice(),
				product.getDiscount(), product.getQuantity(), product.getImage());
	}

	private String categoryAnswer(List<Product> catalog) {
		String categories = catalog.stream().map(this::category).filter(value -> !"Khác".equals(value)).distinct().sorted().collect(Collectors.joining(", "));
		return "VinaBook hiện có các thể loại: " + categories + ". Bạn có thể chọn một thể loại và thêm ngân sách để mình gợi ý chính xác hơn.";
	}

	private boolean isCategoryList(String value) {
		String q = intents.normalize(value);
		return contains(q, "co nhung the loai", "the loai nao", "danh sach the loai");
	}

	private boolean isDeterministicProductInfo(String question, ChatIntent intent, List<Product> selected) {
		if (intent != ChatIntent.PRODUCT_INFO || selected.isEmpty()) return false;
		String q = intents.normalize(question);
		for (Product product : selected) q = q.replace(intents.normalize(product.getName()), "");
		return contains(q, "con hang", "ton kho", "bao nhieu ban", "bao nhieu cuon", "con may")
				|| isPriceQuestion(q);
	}

	private boolean isPriceQuestion(String q) {
		return contains(q, "noi gia", "gia bao nhieu", "gia ban", "gia tien", "bao nhieu tien", "giam gia",
				"giam bao nhieu", "khuyen mai") || q.trim().equals("gia")
				|| q.trim().startsWith("gia cua ");
	}

	private boolean contains(String value, String... options) {
		for (String option : options) if (value.contains(option)) return true;
		return false;
	}

	private String category(Product product) {
		return product.getCategory() == null ? "Khác" : value(product.getCategory().getCategoryName(), "Khác");
	}

	private String value(String value, String fallback) {
		return value == null || value.trim().isEmpty() ? fallback : value.trim();
	}

	private String money(long amount) {
		return String.format(Locale.forLanguageTag("vi-VN"), "%,dđ", amount);
	}
}
